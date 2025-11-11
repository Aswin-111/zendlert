import loginSchema from "../validators/organization/login.validator.js";
import { PrismaClient } from "@prisma/client";
import z from "zod"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import logger from "../utils/logger.js";

const prisma = new PrismaClient();
const EmployeeController = {
    employeeLogin: async (req, res) => {
        try {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) {
                const errors = parsed.error.errors.map(err => err.message);
                return res.status(400).json({ message: "Invalid credentials", errors });
            }

            const { email, password } = parsed.data;

            const user = await prisma.users.findUnique({
                where: { email: email.toLowerCase() },
                include: { role: true, area: true, site: true }, // optional: if you want role info
            });

            if (!user) {
                logger.warn(`Login failed for unknown email: ${email}`);
                return res.status(401).json({ message: "Invalid email or password" });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                logger.warn(`Login failed for user: ${email} - Incorrect password`);
                return res.status(401).json({ message: "Invalid email or password" });
            }
            const JWT_SECRET = process.env.JWT_SECRET
            const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY
            const token = jwt.sign(
                {
                    user_id: user.user_id,
                    email: user.email,
                    role: user.role?.role_name || "user",
                    organization_id: user.organization_id,

                },
                JWT_SECRET,
                { expiresIn: TOKEN_EXPIRY }
            );

            logger.info(`Login success: ${email}`);
            return res.status(200).json({
                message: "Login successful",
                token,
                user: {
                    user_id: user.user_id,
                    organization_id: user.organization_id,
                    email: user.email,
                    name: `${user.first_name} ${user.last_name}`,
                    role: user.role?.role_name || "user",
                    area: {
                        area_id: user.area_id,
                        area_name: user?.area?.name
                    },
                    site: {
                        site_id: user.site_id,
                        site_name: user?.site?.name
                    }
                }
            });
        } catch (error) {
            logger.error("Login error:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },
    respondToAlert : async (req, res) => {
        try {
            const RespondToAlertSchema = z.object({
                alert_id: z.string().uuid('alert_id must be a valid UUID'),
                user_id: z.string().uuid('user_id must be a valid UUID'),
                response: z.enum(['safe', 'not_safe', 'evacuated', 'seeking_shelter']),
                latitude: z.coerce.number().optional(),
                longitude: z.coerce.number().optional(),
                location_name: z.string().trim().max(255).optional(),
            });

            const parsed = RespondToAlertSchema.parse(req.body);
            const { alert_id, user_id, response, latitude, longitude, location_name } = parsed;

            // ✅ Validate alert exists
            const alert = await prisma.alerts.findUnique({
                where: { id: alert_id },
                select: { id: true, status: true, scheduled_time: true },
            });
            if (!alert) return res.status(404).json({ error: 'Alert not found' });

            // ✅ Find recipient (alert-user). If missing, create one so dashboard metrics always include the response.
            let recipient = await prisma.notification_Recipients.findFirst({
                where: { alert_id, user_id },
                select: {
                    id: true,
                    response: true,
                    response_history: true,
                    acknowledged_at: true,
                    delivery_status: true,
                },
            });

            const now = new Date();
            const nowIso = now.toISOString();
            const newHistoryEntry = { response, at: nowIso };

            // Transaction: optional location snapshot + recipient update/create (+ optional alert status nudge)
            const result = await prisma.$transaction(async (tx) => {
                // Optional: snapshot user location if lat/long provided
                if (latitude != null && longitude != null) {
                    await tx.user_Locations.create({
                        data: {
                            user_id,
                            alert_id,
                            latitude: latitude.toString(),
                            longitude: longitude.toString(),
                            location_name: location_name ?? null,
                        },
                    });
                }

                // If recipient missing, create it so dashboard can count it
                if (!recipient) {
                    recipient = await tx.notification_Recipients.create({
                        data: {
                            alert_id,
                            user_id,
                            // Once user responds, it's fair to consider it "delivered"
                            delivery_status: 'delivered',
                            delivered_at: now,
                            acknowledged_at: now,
                            response,
                            response_updated_at: now,
                            response_history: [newHistoryEntry],
                        },
                        select: {
                            id: true,
                            alert_id: true,
                            user_id: true,
                            response: true,
                            response_updated_at: true,
                            acknowledged_at: true,
                            response_history: true,
                            delivery_status: true,
                        },
                    });
                } else {
                    // Update existing recipient
                    recipient = await tx.notification_Recipients.update({
                        where: { id: recipient.id },
                        data: {
                            response,
                            response_updated_at: now,
                            acknowledged_at: recipient.acknowledged_at ?? now,
                            // Append to JSON history safely
                            response_history: Array.isArray(recipient.response_history)
                                ? [...recipient.response_history, newHistoryEntry]
                                : [newHistoryEntry],
                            // If they responded, ensure delivery is marked delivered (helps your delivery_average)
                            ...(recipient.delivery_status !== 'delivered' && {
                                delivery_status: 'delivered',
                                delivered_at: now,
                            }),
                        },
                        select: {
                            id: true,
                            alert_id: true,
                            user_id: true,
                            response: true,
                            response_updated_at: true,
                            acknowledged_at: true,
                            response_history: true,
                            delivery_status: true,
                        },
                    });
                }

                // Optional: if alert was "scheduled" and someone responded, nudge it to "active"
                // (comment this out if you drive status elsewhere)
                if (alert.status === 'scheduled') {
                    await tx.alerts.update({
                        where: { id: alert_id },
                        data: { status: 'active', start_time: alert.scheduled_time ?? now },
                    });
                }

                return recipient;
            });

            // ✅ Your dashboard queries will now pick up:
            // - safe / not_safe / evacuated / seeking_shelter via `response`
            // - not_responded via `response = null` (unchanged for others)
            // - delivery_average via `delivery_status = delivered` (set above)

            return res.status(200).json({
                message: 'Response recorded successfully',
                recipient: result,
            });
        } catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            console.error('respondToAlert error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

}

export default EmployeeController   