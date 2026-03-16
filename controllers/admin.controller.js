import { DeliveryStatus, UserTypes, DeliveryMethod, AlertStatus } from "@prisma/client";
import moment from "moment";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Resend } from "resend";
import admin from "../config/firebase.auth.js";
import logger from "../utils/logger.js"; // your Winston logger
import prisma from "../utils/prisma.js";
import {
    normalizeIncomingDateTimeToUtc,
    utcNow,
} from "../utils/datetime.js";
import { notificationQueue } from "../services/queue.service.js";
import {
    getOrganizationIdOrUnauthorized,
    respondWithKnownServiceError,
} from "../helpers/alert-controller.helper.js";

import createAlertSchema from "../validators/alert/create-alert.validator.js";
import addEmployeeSchema from "../validators/admin/add-employee.validator.js";
import {
    createAlertForOrganization, getAlertDashboardPayload, resolveAlertForOrganization, getAlertTypesForOrganization, getSitesForOrganization,getAreasForOrganizationSite
} from "../services/alert.service.js";

import adminCreateAlertSchema from "../validators/admin/create-alert.validator.js";
import createContractingCompanySchema from "../validators/admin/create-contracting-company.validator.js";
import {
    alertIdParamSchema,
    areaIdParamSchema,
    createAreaSchema,
    createSiteSchema,
    siteIdParamSchema,
    updateAreaSchema,
    updateSiteSchema,
} from "../validators/admin/site-area.validator.js";

import {
    companyIdParamSchema,
    editContractingCompanyBodySchema,
    editContractingCompanyParamsSchema,
    reportNotificationBodySchema,
    siteAlertsBodySchema,
    toggleEmployeeStatusBodySchema,
    toggleEmployeeStatusParamsSchema,
} from "../validators/admin/user-company.validator.js";
import {
    getEmailDomainOrThrow,
    normalizeDomain,
} from "../helpers/admin.helper.js";
import {
    buildSiteAddress,
    ensureAdminOrganizationOrError,
    ensureSiteIdOrError,
    findSiteForOrganization,
} from "../helpers/admin-site.helper.js";
import { findAreaByOrganization } from "../helpers/ownership.helper.js";
import {
    buildAlertDetailComputedFields,
    buildRecipientUsers,
    summarizeRecipientResponses,
} from "../helpers/admin-alert-details.helper.js";
const resend = new Resend(process.env.RESEND_KEY);

// Block common/public email providers (employee + contractor)
const PUBLIC_EMAIL_DOMAINS = new Set([
    // "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.in",
    "yahoo.in",
    "ymail.com",
    "aol.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "zoho.com",
    "zohomail.com",
    "mail.com",
    "gmx.com",
    "gmx.net",
    "yandex.com",
    "yandex.ru",
    "fastmail.com",
    "hey.com",
]);
const AdminController = {
    getAlertSummaryForOrg: async (req, res) => {
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;
        const requestId = req.requestId || null;

        try {
            const { q } = req.query;

            logger.info("Fetching alert summary for organization", {
                meta: {
                    requestId,
                    userId,
                    organizationId,
                    query: q || null
                }
            });

            if (!organizationId) {
                logger.warn("Organization ID missing in token", {
                    meta: { requestId, userId }
                });

                return res.status(401).json({ message: "Unauthorized" });
            }

            const organization = await prisma.organizations.findUnique({
                where: { organization_id: organizationId },
                select: { name: true },
            });

            if (!organization) {
                logger.warn("Organization not found", {
                    meta: { requestId, organizationId }
                });

                return res.status(404).json({ message: "Organization not found" });
            }

            const alertWhere = {
                organization_id: organizationId,
                ...(q
                    ? {
                        message: {
                            contains: String(q),
                            mode: "insensitive",
                        },
                    }
                    : {}),
            };

            const totalAlerts = await prisma.alerts.count({
                where: alertWhere,
            });

            const activeUsersCount = await prisma.users.count({
                where: {
                    organization_id: organizationId,
                    is_active: true,
                },
            });

            const areas = await prisma.areas.findMany({
                where: {
                    site: {
                        organization_id: organizationId,
                    },
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                },
                orderBy: {
                    name: "asc",
                },
            });

            const recipientMetrics = await prisma.$queryRaw`
        SELECT
          COUNT(nr.id)::int AS total_recipients,
          COUNT(nr.acknowledged_at)::int AS acknowledged_recipients,
          COALESCE(AVG(EXTRACT(EPOCH FROM (nr.acknowledged_at - nr.delivered_at))),0)::float AS avg_response_seconds
        FROM "Notification_Recipients" nr
        JOIN "Alerts" a ON a.id = nr.alert_id
        WHERE a.organization_id = ${organizationId}
          AND nr.delivered_at IS NOT NULL
    `;

            const row = Array.isArray(recipientMetrics)
                ? recipientMetrics[0]
                : recipientMetrics;

            const totalRecipients = Number(row?.total_recipients ?? 0);
            const acknowledgedRecipients = Number(row?.acknowledged_recipients ?? 0);
            const avgResponseSeconds = Math.round(Number(row?.avg_response_seconds ?? 0));

            const responseRate =
                totalRecipients > 0
                    ? (acknowledgedRecipients / totalRecipients) * 100
                    : 0;

            const weatherAlert =
                (await prisma.alerts.findFirst({
                    where: {
                        organization_id: organizationId,
                        message: {
                            contains: "weather",
                            mode: "insensitive",
                        },
                    },
                    select: { id: true },
                })) !== null;

            const responsePayload = {
                organization_name: organization.name,
                total_alerts: totalAlerts,
                total_recipients: totalRecipients,
                acknowledged_recipients: acknowledgedRecipients,
                response_rate_percent: Number(responseRate.toFixed(2)),
                average_response_time_seconds: avgResponseSeconds,
                active_users: activeUsersCount,
                weather_alert: Boolean(weatherAlert),
                areas,
            };

            logger.info("Alert summary generated successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    totalAlerts,
                    responseRate: Number(responseRate.toFixed(2)),
                    activeUsersCount
                }
            });

            return res.status(200).json(responsePayload);

        } catch (error) {

            logger.error("getAlertSummaryForOrg failed", {
                error,
                meta: {
                    requestId,
                    userId,
                    organizationId
                }
            });

            return res.status(500).json({
                message: "Server error",
            });
        }
    },
    getAreaAlerts: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {
            const { areaId } = req.params;

            logger.info("Fetching area alerts", {
                meta: { requestId, userId, organizationId, areaId },
            });

            if (!organizationId) {
                logger.warn("Unauthorized: missing organization_id in token", {
                    meta: { requestId, userId },
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!areaId) {
                logger.warn("Validation failed: areaId missing", {
                    meta: { requestId, organizationId, userId },
                });
                return res.status(400).json({ message: "areaId is required" });
            }

            // ✅ Area must belong to this org
            const area = await prisma.areas.findFirst({
                where: {
                    id: areaId,
                    site: { organization_id: organizationId },
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    site: {
                        select: {
                            id: true,
                            name: true,
                            organization: {
                                select: {
                                    organization_id: true,
                                    name: true,
                                    main_contact_name: true,
                                    main_contact_email: true,
                                    main_contact_phone: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!area) {
                logger.warn("Area not found or not in org", {
                    meta: { requestId, organizationId, areaId },
                });
                return res.status(404).json({ message: "Area not found" });
            }

            const now = new Date();

            // ✅ Recent (already started; scheduled_time null OR <= now)
            const recentAlerts = await prisma.alerts.findMany({
                where: {
                    organization_id: organizationId,
                    Alert_Areas: { some: { area_id: area.id } },
                    OR: [
                        { scheduled_time: null },
                        { scheduled_time: { lte: now } },
                    ],
                },
                orderBy: { created_at: "desc" },
                take: 100,
            });

            // ✅ Upcoming (scheduled in future)
            const upcomingAlerts = await prisma.alerts.findMany({
                where: {
                    organization_id: organizationId,
                    Alert_Areas: { some: { area_id: area.id } },
                    scheduled_time: { gt: now },
                },
                orderBy: { scheduled_time: "asc" },
                take: 100,
            });

            // ✅ Scheduled (any scheduled_time not null)
            const scheduledAlerts = await prisma.alerts.findMany({
                where: {
                    organization_id: organizationId,
                    Alert_Areas: { some: { area_id: area.id } },
                    scheduled_time: { not: null },
                },
                orderBy: { scheduled_time: "desc" },
                take: 100,
            });

            const emergencyContact =
                area.site.organization.main_contact_name
                    ? {
                        name: area.site.organization.main_contact_name,
                        email: area.site.organization.main_contact_email,
                        phone: area.site.organization.main_contact_phone,
                    }
                    : null;

            const payload = {
                area: {
                    id: area.id,
                    name: area.name,
                    description: area.description,
                },
                site: {
                    id: area.site.id,
                    name: area.site.name,
                },
                organization: {
                    id: area.site.organization.organization_id,
                    name: area.site.organization.name,
                },
                emergency_contact: emergencyContact,

                recent_alerts: recentAlerts,
                upcoming_alerts: upcomingAlerts,
                scheduled_alerts: scheduledAlerts,
            };

            logger.info("Area alerts fetched successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    areaId,
                    recent: recentAlerts.length,
                    upcoming: upcomingAlerts.length,
                    scheduled: scheduledAlerts.length,
                },
            });

            return res.status(200).json(payload);
        } catch (error) {
            logger.error("getAreaAlerts failed", {
                error,
                meta: { requestId, organizationId, userId, areaId: req.params?.areaId },
            });

            return res.status(500).json({ message: "Server error" });
        }
    },
    listAreas: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {
            if (!organizationId) {
                logger.warn("Unauthorized: missing organization_id in token", {
                    meta: { requestId, userId },
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            // ✅ single query (same result as sites->areas)
            const usePagination =
                req.query?.page !== undefined || req.query?.limit !== undefined;
            const pageNumber = Math.max(parseInt(req.query?.page, 10) || 1, 1);
            const pageSize = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);

            const queryOptions = {
                where: {
                    site: { organization_id: organizationId },
                },
                orderBy: { name: "asc" },
            };

            if (usePagination) {
                queryOptions.skip = (pageNumber - 1) * pageSize;
                queryOptions.take = pageSize;
            }

            const areas = await prisma.areas.findMany(queryOptions);

            logger.info("Areas fetched successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    count: areas.length,
                },
            });

            return res.status(200).json({
                organization_id: organizationId,
                areas,
            });
        } catch (error) {
            logger.error("listAreas error", {
                error,
                meta: { requestId, organizationId, userId },
            });

            return res.status(500).json({ message: "Server error" });
        }
    },
    listSites: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {

            if (!organizationId) {
                logger.warn("Unauthorized request: organization_id missing", {
                    meta: { requestId, userId }
                });

                return res.status(401).json({ message: "Unauthorized" });
            }

            logger.info("Fetching all sites for organization", {
                meta: { requestId, organizationId, userId }
            });

            const usePagination =
                req.query?.page !== undefined || req.query?.limit !== undefined;
            const pageNumber = Math.max(parseInt(req.query?.page, 10) || 1, 1);
            const pageSize = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);

            // Fetch sites belonging to the organization
            const queryOptions = {
                where: { organization_id: organizationId },
                orderBy: { created_at: "desc" },
            };

            if (usePagination) {
                queryOptions.skip = (pageNumber - 1) * pageSize;
                queryOptions.take = pageSize;
            }

            const sites = await prisma.sites.findMany(queryOptions);

            const response = {
                total_sites: sites.length,
                sites
            };

            logger.info("Sites fetched successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    total_sites: sites.length
                }
            });

            return res.status(200).json(response);

        } catch (error) {

            logger.error("listSites error", {
                error,
                meta: { requestId, organizationId, userId }
            });

            return res.status(500).json({
                message: "Server error"
            });
        }
    },
    listAreasBySite: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {
            // supports both: /sites/:siteId/areas and old ?site_id=
            const siteId = req.params?.siteId || req.query?.site_id;

            if (!organizationId) {
                logger.warn("Unauthorized: missing organization_id in token", {
                    meta: { requestId, userId },
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!siteId) {
                logger.warn("Validation failed: site_id missing", {
                    meta: { requestId, organizationId, userId },
                });
                return res.status(400).json({ message: "site_id is required." });
            }

            // ✅ Verify site exists AND belongs to org
            const siteExists = await findSiteForOrganization(
                prisma,
                siteId,
                organizationId,
                { id: true },
            );

            if (!siteExists) {
                logger.warn("Site not found (or not in org)", {
                    meta: { requestId, organizationId, siteId },
                });
                return res.status(404).json({ message: "Site not found." });
            }

            // ✅ Fetch areas belonging to the site
            const areas = await prisma.areas.findMany({
                where: { site_id: siteId },
                orderBy: { created_at: "desc" },
            });

            logger.info("Areas fetched for site", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    siteId,
                    total_areas: areas.length,
                },
            });

            return res.status(200).json({ total_areas: areas.length, areas });
        } catch (error) {
            logger.error("listAreasBySite error", {
                error,
                meta: { requestId, organizationId, userId },
            });

            return res.status(500).json({ message: "Server error" });
        }
    },
    listRoles: async (req, res) => {
        const requestId = req.requestId || null;
        const userId = req.user?.user_id;
        const organizationId = req.user?.organization_id;

        try {

            logger.info("Fetching all roles", {
                meta: { requestId, userId, organizationId }
            });

            const roles = await prisma.roles.findMany();

            logger.info("Roles fetched successfully", {
                meta: {
                    requestId,
                    userId,
                    organizationId,
                    total_roles: roles.length
                }
            });

            return res.json({ roles });

        } catch (err) {

            logger.error("listRoles error", {
                error: err,
                meta: { requestId, userId, organizationId }
            });

            return res.status(500).json({
                message: "something went wrong"
            });
        }
    },
    createUser: async (req, res) => {
        const requestId = req.requestId || null;
        const actorUserId = req.user?.user_id;
        const organizationId = req.user?.organization_id;

        try {
            if (!organizationId) {
                logger.warn("Unauthorized: missing organization_id in token", {
                    meta: { requestId, actorUserId },
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            const parsed = addEmployeeSchema.safeParse(req.body);
            if (!parsed.success) {
                const errors = parsed.error.errors.map((e) => e.message);
                logger.warn("Validation failed: createUser", {
                    meta: { requestId, organizationId, actorUserId, errors },
                });
                return res.status(400).json({ message: "Validation failed", errors });
            }

            const {
                // organization_id is intentionally ignored from body (security)
                site_id,
                area_id,
                first_name,
                last_name,
                email,
                phone_number,
                admin_access,
                is_employee,
                contracting_company_id,
            } = parsed.data;

            const normalizedEmail = String(email).trim().toLowerCase();
            const emailDomain = getEmailDomainOrThrow(normalizedEmail);

            const user_type = is_employee ? UserTypes.employee : UserTypes.contractor;

            logger.info("Creating user", {
                meta: {
                    requestId,
                    organizationId,
                    actorUserId,
                    user_type,
                    admin_access: Boolean(admin_access),
                    site_id: site_id || null,
                    area_id: area_id || null,
                    email_domain: emailDomain,
                },
            });

            // org lookup (needed for domain match + email content)
            const org = await prisma.organizations.findUnique({
                where: { organization_id: String(organizationId) },
                select: { organization_id: true, name: true, email_domain: true },
            });

            if (!org) {
                logger.warn("Organization not found for actor", {
                    meta: { requestId, organizationId, actorUserId },
                });
                return res.status(400).json({ message: "Organization not found." });
            }

            const orgDomain = normalizeDomain(org.email_domain);

            // 1) Block public/ordinary emails for BOTH employee + contractor
            if (PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
                return res.status(400).json({
                    message:
                        "Public email domains (gmail, yahoo, outlook, etc.) are not allowed. Please use a company email address.",
                    blocked_domain: emailDomain,
                });
            }

            // 2) ONLY employees must match organization domain
            if (user_type === UserTypes.employee && emailDomain !== orgDomain) {
                return res.status(400).json({
                    message: "Employee email must match organization email domain.",
                    organization_email_domain: orgDomain,
                    provided_email_domain: emailDomain,
                });
            }

            // contractor must provide contracting company id
            if (user_type === UserTypes.contractor && !contracting_company_id) {
                return res.status(400).json({ message: "Contracting company is required." });
            }

            // ✅ Guard: site_id must belong to this org (if provided)
            if (site_id) {
                const siteOk = await findSiteForOrganization(
                    prisma,
                    site_id,
                    organizationId,
                    { id: true },
                );
                if (!siteOk) {
                    return res.status(400).json({ message: "Invalid site_id for this organization." });
                }
            }

            // ✅ Guard: area_id must belong to this org (if provided)
            if (area_id) {
                const areaOk = await findAreaByOrganization(
                    prisma,
                    area_id,
                    organizationId,
                    { select: { id: true } },
                );
                if (!areaOk) {
                    return res.status(400).json({ message: "Invalid area_id for this organization." });
                }
            }

            // Find role based on admin_access
            const roleName = admin_access ? "admin" : "employee";
            const role = await prisma.roles.findFirst({ where: { role_name: roleName } });

            if (!role) {
                return res.status(400).json({ message: `${roleName} role not found.` });
            }

            const temporaryPasswordHash = await bcrypt.hash(
                crypto.randomBytes(32).toString("hex"),
                10,
            );

            // Transaction so we don’t create partial records
            const result = await prisma.$transaction(async (tx) => {
                // Create user (same fields, but org comes from token)
                const newUser = await tx.users.create({
                    data: {
                        organization_id: String(organizationId),
                        site_id: site_id ? String(site_id) : null,
                        area_id: area_id ? String(area_id) : null,
                        email: normalizedEmail,
                        password_hash: temporaryPasswordHash,
                        first_name,
                        last_name,
                        phone_number: phone_number || "",
                        role_id: role.id,
                        user_type,
                        must_reset_password: true,
                    },
                });

                if (user_type === UserTypes.employee) {
                    await tx.employees.create({ data: { user_id: newUser.user_id } });
                } else {
                    await tx.contractors.create({
                        data: {
                            user_id: newUser.user_id,
                            contracting_company_id: String(contracting_company_id),
                        },
                    });
                }

                // Invitation token
                const token = crypto.randomBytes(32).toString("hex");
                const inviteSentAt = utcNow();
                const expiresAt = new Date(inviteSentAt.getTime() + 1000 * 60 * 60 * 24 * 2); // 48h

                await tx.invitations.create({
                    data: {
                        organization_id: org.organization_id,
                        user_id: newUser.user_id,
                        token,
                        expires_at: expiresAt,
                        is_used: false,
                        created_by: actorUserId ?? null,
                        delivery_method: DeliveryMethod.email,
                        sent_at: inviteSentAt,
                    },
                });

                return { newUser, token, expiresAt };
            });

            const { newUser, token, expiresAt } = result;

            const appBaseUrl = process.env.APP_BASE_URL || "";
            const setupLink = `${appBaseUrl.replace(/\/$/, "")}/finish-profile-setup?token=${token}`;

            // Send email (same behavior: skip if missing key)
            if (!process.env.RESEND_KEY) {
                logger.warn("RESEND_KEY missing. Skipping email send.", {
                    meta: { requestId, organizationId, actorUserId, to: normalizedEmail },
                });
            } else {
                const from = process.env.RESEND_FROM_EMAIL || "Your App <no-reply@yourdomain.com>";

                await resend.emails.send({
                    from,
                    to: normalizedEmail,
                    subject: `You’ve been added to ${org.name} — finish your setup`,
                    html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5">
            <p>Hi ${first_name || ""} ${last_name || ""},</p>
            <p>You have been added by an admin to <b>${org.name}</b>.</p>
            <p>Click the button below to finish your profile setup:</p>
            <p>
              <a href="${setupLink}"
                 style="display:inline-block;padding:10px 14px;border-radius:8px;
                        text-decoration:none;background:#111827;color:#fff">
                Finish profile setup
              </a>
            </p>
            <p>If the button doesn’t work, copy/paste this link:</p>
            <p><a href="${setupLink}">${setupLink}</a></p>
            <p>This link expires at: ${expiresAt.toISOString()}</p>
          </div>
        `,
                });
            }

            logger.info("User created successfully", {
                meta: {
                    requestId,
                    organizationId,
                    actorUserId,
                    newUserId: newUser.user_id,
                    user_type: newUser.user_type,
                    role: role.role_name,
                },
            });

            return res.status(200).json({
                message: "Employee created successfully. Setup email sent.",
                user: {
                    id: newUser.user_id,
                    name: `${newUser.first_name} ${newUser.last_name}`,
                    email: newUser.email,
                    role: role.role_name,
                    user_type: newUser.user_type,
                },
            });
        } catch (error) {
            if (error?.code === "P2002" && error?.meta?.target?.includes("email")) {
                return res.status(409).json({
                    message: "Email is already in use. Please use a different email address.",
                });
            }

            if (error?.statusCode) {
                return res.status(error.statusCode).json({ message: error.message });
            }

            logger.error("createUser error", {
                error,
                meta: { requestId, organizationId, actorUserId },
            });

            return res.status(500).json({ message: "Server error" });
        }
    },
    deactivateUser: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const actorUserId = req.user?.user_id;

        try {
            const userId = req.params.userId;

            if (!organizationId) {
                logger.warn("Unauthorized: organization_id missing in token", {
                    meta: { requestId, actorUserId }
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!userId) {
                return res.status(400).json({ message: "user_id is required" });
            }

            // Check if user exists within the same organization
            const user = await prisma.users.findFirst({
                where: {
                    user_id: userId,
                    organization_id: organizationId
                }
            });

            if (!user) {
                logger.warn("User not found or not in organization", {
                    meta: { requestId, organizationId, userId }
                });
                return res.status(404).json({ message: "User not found" });
            }

            // Deactivate user
            await prisma.users.update({
                where: { user_id: userId },
                data: { is_active: false },
            });

            logger.info("User deactivated successfully", {
                meta: {
                    requestId,
                    organizationId,
                    actorUserId,
                    targetUserId: userId
                }
            });

            return res.status(200).json({
                message: "User deactivated successfully"
            });

        } catch (error) {

            logger.error("deactivateUser error", {
                error,
                meta: { requestId, organizationId, actorUserId }
            });

            return res.status(500).json({
                message: "Server error"
            });
        }
    },
    listEmergencyTypes: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {

            if (!organizationId) {
                logger.warn("Unauthorized: organization_id missing in token", {
                    meta: { requestId, userId }
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            logger.info("Fetching emergency types", {
                meta: { requestId, organizationId, userId }
            });

            const alerts = await prisma.emergency_Types.findMany({
                where: {
                    organization_id: organizationId
                }
            });

            logger.info("Emergency types fetched successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    total_types: alerts.length
                }
            });

            return res.status(200).json({ alerts });

        } catch (error) {

            logger.error("listEmergencyTypes error", {
                error,
                meta: { requestId, organizationId, userId }
            });

            return res.status(500).json({
                message: "Server error"
            });
        }
    },
    // createAlert: async (req, res) => {
    //     const requestId = req.requestId || null;
    //     const organizationId = req.user?.organization_id;
    //     const actorUserId = req.user?.user_id;

    //     try {
    //         if (!organizationId || !actorUserId) {
    //             logger.warn("Unauthorized: missing org/user in token", {
    //                 meta: { requestId, organizationId, actorUserId },
    //             });
    //             return res.status(401).json({ message: "Unauthorized" });
    //         }

    //         // ✅ Schema: org/user removed from body (JWT-scoped)
    //         const parsed = adminCreateAlertSchema.parse(req.body);

    //         const startTime = normalizeIncomingDateTimeToUtc(parsed.start_time);
    //         const endTime = normalizeIncomingDateTimeToUtc(parsed.end_time);

    //         if (!startTime || !endTime) {
    //             return res.status(400).json({ error: "Invalid start or end time format" });
    //         }
    //         if (startTime.getTime() > endTime.getTime()) {
    //             return res.status(400).json({ error: "Start time cannot be after end time." });
    //         }

    //         logger.info("Creating alert", {
    //             meta: {
    //                 requestId,
    //                 organizationId,
    //                 actorUserId,
    //                 emergency_type_id: parsed.emergency_type_id,
    //             },
    //         });

    //         // ✅ Ensure emergency type belongs to same org (security)
    //         const alertType = await prisma.emergency_Types.findFirst({
    //             where: {
    //                 id: parsed.emergency_type_id,
    //                 organization_id: organizationId,
    //             },
    //             select: { name: true },
    //         });

    //         if (!alertType) {
    //             return res.status(400).json({ error: "Invalid emergency_type_id for this organization" });
    //         }

    //         // Create alert
    //         const alert = await prisma.alerts.create({
    //             data: {
    //                 user_id: actorUserId,
    //                 organization_id: organizationId,
    //                 emergency_type_id: parsed.emergency_type_id,
    //                 message: parsed.message,
    //                 start_time: startTime,
    //                 end_time: endTime,
    //                 status: "active",
    //             },
    //         });

    //         // Fetch all users of org (same behavior)
    //         const usersOfOrg = await prisma.users.findMany({
    //             where: { organization_id: organizationId },
    //             select: { fcm_token: true, user_id: true },
    //         });

    //         logger.info("Dispatching FCM notifications for alert", {
    //             meta: {
    //                 requestId,
    //                 organizationId,
    //                 actorUserId,
    //                 alertId: alert.id,
    //                 recipients: usersOfOrg.length,
    //             },
    //         });

    //         // Send notifications + create recipient rows
    //         const tasks = usersOfOrg
    //             .filter((u) => Boolean(u.fcm_token))
    //             .map(async (u) => {
    //                 const token = u.fcm_token;

    //                 const individualMessage = {
    //                     notification: { title: alertType.name, body: parsed.message },
    //                     token,
    //                 };

    //                 try {
    //                     await admin.messaging().send(individualMessage);

    //                     await prisma.notification_Recipients.create({
    //                         data: {
    //                             alert_id: alert.id,
    //                             user_id: u.user_id,
    //                         },
    //                     });
    //                 } catch (err) {
    //                     logger.warn("FCM send failed for user", {
    //                         error: err,
    //                         meta: { requestId, organizationId, alertId: alert.id, targetUserId: u.user_id },
    //                     });

    //                     if (err?.code === "messaging/registration-token-not-registered") {
    //                         await prisma.users.update({
    //                             where: { user_id: u.user_id },
    //                             data: { fcm_token: null },
    //                         });

    //                         logger.warn("Removed invalid FCM token", {
    //                             meta: { requestId, organizationId, targetUserId: u.user_id },
    //                         });
    //                     }
    //                 }
    //             });

    //         // ✅ Ensure tasks actually run reliably; we don't fail the API if some sends fail
    //         await Promise.allSettled(tasks);

    //         logger.info("Alert created successfully", {
    //             meta: {
    //                 requestId,
    //                 organizationId,
    //                 actorUserId,
    //                 alertId: alert.id,
    //             },
    //         });

    //         // ✅ Your old code didn't send a response (bug). Return success.
    //         return res.status(201).json({
    //             message: "Alert created successfully",
    //             alert_id: alert.id,
    //         });
    //     } catch (err) {
    //         if (err?.name === "ZodError") {
    //             return res.status(400).json({ error: err.errors });
    //         }

    //         logger.error("createAlert error", {
    //             error: err,
    //             meta: { requestId, organizationId, actorUserId },
    //         });

    //         return res.status(500).json({ error: "Server Error" });
    //     }
    // },
    reportNotification: async (req, res) => {
        try {
            const orgId = req.user.organization_id;

            const parsed = reportNotificationBodySchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({
                    message: "user_id are required",
                });
            }
            const { user_id } = parsed.data;

            // Ensure user belongs to this org (org ownership enforced)
            const reporteduser = await prisma.users.findFirst({
                where: {
                    user_id: user_id,
                    organization_id: orgId,
                },
                select: {
                    first_name: true,
                    last_name: true,
                },
            });

            if (reporteduser) {
                logger.info(
                    `reported user : ${reporteduser.first_name} ${reporteduser.last_name}`
                );
            }

            // Get latest recipient for that user within this org (via Alerts.organization_id)
            const lastRecepient = await prisma.notification_Recipients.findFirst({
                where: {
                    user_id: user_id,
                    alert: {
                        organization_id: orgId,
                    },
                },
                orderBy: {
                    created_at: "desc",
                },
                select: {
                    id: true,
                    delivery_status: true,
                },
            });

            if (!lastRecepient) {
                return res.status(400).json({ message: "Notification not found" });
            }

            if (lastRecepient.delivery_status === DeliveryStatus.delivered) {
                return res.status(400).json({ message: "Notification already reported" });
            }

            await prisma.notification_Recipients.update({
                where: { id: lastRecepient.id },
                data: {
                    delivery_status: DeliveryStatus.delivered,
                },
            });

            return res.status(200).json({ message: "Notification reported successfully" });
        } catch (error) {
            logger.error("reportNotification error:", error);
            return res
                .status(500)
                .json({ message: "Server error", error: error.message });
        }
    },
    getAllContractingCompanies: async (req, res) => {
        try {
            const organization_id = req.user.organization_id;

            const contracting_companies = await prisma.contracting_Companies.findMany({
                where: {
                    organization_id: organization_id,
                },
            });

            return res.json({ contracting_companies });
        } catch (err) {
            logger.error("getAllContractingCompanies error:", err);
            return res
                .status(500)
                .json({ message: "Something went wrong", error: err });
        }
    },
    createContractingCompany: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            const parsed = createContractingCompanySchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: parsed.error.flatten(),
                });
            }

            const { name, contact_email, phone, address } = parsed.data;

            // --- check name ---
            const existingName = await prisma.contracting_Companies.findFirst({
                where: { organization_id, name },
            });
            if (existingName) {
                return res.status(409).json({
                    message: "A company with this name already exists.",
                });
            }

            // --- check email only if provided ---
            if (contact_email) {
                const existingEmail = await prisma.contracting_Companies.findFirst({
                    where: { organization_id, contact_email },
                });

                if (existingEmail) {
                    return res.status(409).json({
                        message: "A company with this email already exists.",
                    });
                }
            }

            if (phone) {
                const existingPhone = await prisma.contracting_Companies.findFirst({
                    where: { organization_id, phone },
                });

                if (existingPhone) {
                    return res.status(409).json({
                        message: "A company with this phone number already exists.",
                    });
                }
            }

            // --- create new company ---
            const contracting_company = await prisma.contracting_Companies.create({
                data: { organization_id, name, contact_email, phone, address },
            });

            return res.status(200).json({
                message: "Contracting company created successfully",
                contracting_company,
            });
        } catch (err) {
            logger.error("createContractingCompany error:", err);
            return res.status(500).json({
                message: "Something went wrong",
                error: err
            });
        }
    },
    getContractingCompanies: async (req, res) => {
        try {
            const organization_id = req.user.organization_id;

            const contracting_companies = await prisma.contracting_Companies.findMany({
                where: { organization_id },
                select: {
                    id: true,
                    name: true,
                    contact_email: true,
                    phone: true,
                    address: true,
                    organization_id: true,
                    _count: {
                        select: {
                            contractors: {
                                where: {
                                    user: {
                                        is_active: true,
                                    },
                                },
                            },
                        },
                    },
                },
            });

            // keep response structure exactly the same as existing behavior
            const result = contracting_companies.map((company) => ({
                ...company,
                active_user_count: company._count.contractors,
                _count: undefined,
            }));

            return res.json({ contracting_companies: result });
        } catch (err) {
            logger.error("getContractingCompanies error:", err);
            return res
                .status(500)
                .json({ message: "Something went wrong", error: err.message });
        }
    },
    editContractingCompany: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            const parsedParams = editContractingCompanyParamsSchema.safeParse(req.params ?? {});
            if (!parsedParams.success) {
                return res.status(400).json({ message: "company_id is required" });
            }

            const { companyId } = parsedParams.data;

            const parsedBody = editContractingCompanyBodySchema.safeParse(req.body ?? {});
            if (!parsedBody.success) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: parsedBody.error.flatten(),
                });
            }

            const { name, contact_email, phone, address } = parsedBody.data;

            const data = {};

            // only update fields that actually have values
            if (name !== undefined) data.name = name;
            if (contact_email !== undefined) data.contact_email = contact_email.toLowerCase();
            if (phone !== undefined) data.phone = phone;
            if (address !== undefined) data.address = address;

            if (Object.keys(data).length === 0) {
                return res.status(400).json({
                    message: "No fields provided for update",
                });
            }

            // check if company exists and belongs to this organization
            const existingCompany = await prisma.contracting_Companies.findFirst({
                where: {
                    id: companyId,
                    organization_id,
                },
            });

            if (!existingCompany) {
                return res.status(404).json({ message: "Company not found" });
            }

            // check duplicate name only if provided
            if (name !== undefined) {
                const existingName = await prisma.contracting_Companies.findFirst({
                    where: {
                        organization_id,
                        name: data.name,
                        NOT: { id: companyId },
                    },
                });

                if (existingName) {
                    return res.status(409).json({
                        message: "A company with this name already exists.",
                    });
                }
            }

            // check duplicate email only if provided
            if (contact_email !== undefined) {
                const existingEmail = await prisma.contracting_Companies.findFirst({
                    where: {
                        organization_id,
                        contact_email: data.contact_email,
                        NOT: { id: companyId },
                    },
                });

                if (existingEmail) {
                    return res.status(409).json({
                        message: "A company with this email already exists.",
                    });
                }
            }

            // check duplicate phone only if provided
            if (phone !== undefined) {
                const existingPhone = await prisma.contracting_Companies.findFirst({
                    where: {
                        organization_id,
                        phone: data.phone,
                        NOT: { id: companyId },
                    },
                });

                if (existingPhone) {
                    return res.status(409).json({
                        message: "A company with this phone number already exists.",
                    });
                }
            }

            const updated = await prisma.contracting_Companies.update({
                where: {
                    id: companyId,
                },
                data,
                select: {
                    id: true,
                    organization_id: true,
                    name: true,
                    contact_email: true,
                    phone: true,
                    address: true,
                },
            });

            return res.status(200).json({
                message: "Company updated",
                company: updated,
            });
        } catch (err) {
            if (err?.code === "P2025") {
                return res.status(404).json({ message: "Company not found" });
            }

            logger.error("editContractingCompany error:", err);
            return res.status(500).json({
                message: "Server error",
                error: err.message,
            });
        }
    },
    getSiteAlerts: async (req, res) => {
        const requestId = req.requestId || null;
        const organizationId = req.user?.organization_id;
        const userId = req.user?.user_id;

        try {
            const parsedBody = siteAlertsBodySchema.safeParse(req.body ?? {});

            if (!organizationId) {
                logger.warn("Unauthorized: missing organization_id in token", {
                    meta: { requestId, userId },
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!parsedBody.success) {
                logger.warn("Validation failed: building_name missing/invalid", {
                    meta: { requestId, organizationId, userId, building_name: req.body?.building_name ?? null },
                });
                return res.status(400).json({ message: "Building name is required." });
            }
            const { building_name } = parsedBody.data;

            logger.info("Fetching site alerts (building alerts)", {
                meta: { requestId, organizationId, userId, building_name },
            });

            // Step 1: Get Site (building) by name within org
            const site = await prisma.sites.findFirst({
                where: {
                    name: building_name,
                    organization_id: organizationId, // ✅ enforce org ownership (previously missing)
                },
                select: {
                    id: true,
                    name: true,
                    organization: {
                        select: { name: true },
                    },
                },
            });

            if (!site) {
                logger.warn("Building(site) not found in org", {
                    meta: { requestId, organizationId, building_name },
                });
                return res.status(404).json({ message: "Building not found." });
            }

            const siteId = site.id;

            // Step 2: Get Alerts linked to this building via Alert_Sites (same as before)
            const alerts = await prisma.alerts.findMany({
                where: {
                    // keep same logic; just add org guard for safety
                    organization_id: organizationId,
                    Alert_Sites: {
                        some: { site_id: siteId },
                    },
                },
                orderBy: { created_at: "desc" },
            });

            // Keep EXACT filtering behavior (don’t change logic to SQL to avoid edge-case differences)
            const now = new Date();
            const recentAlerts = alerts.filter((alert) => alert.start_time && alert.start_time <= now);
            const upcomingAlerts = alerts.filter((alert) => alert.scheduled_time && alert.scheduled_time > now);
            const scheduledAlerts = alerts.filter((alert) => !alert.start_time && alert.scheduled_time);

            // Step 3: Emergency contacts: Users from the site (same)
            const emergencyContacts = await prisma.users.findMany({
                where: {
                    organization_id: organizationId, // ✅ safety guard
                    site_id: siteId,
                    is_active: true,
                },
                select: {
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true,
                },
                orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
            });

            const payload = {
                building: building_name,
                organization: site.organization?.name || null,
                total_alerts: alerts.length,
                recent_alerts: recentAlerts,
                upcoming_alerts: upcomingAlerts,
                scheduled_alerts: scheduledAlerts,
                emergency_contacts: emergencyContacts,
            };

            logger.info("Site alerts fetched successfully", {
                meta: {
                    requestId,
                    organizationId,
                    userId,
                    siteId,
                    building_name,
                    total_alerts: alerts.length,
                    recent: recentAlerts.length,
                    upcoming: upcomingAlerts.length,
                    scheduled: scheduledAlerts.length,
                    emergency_contacts: emergencyContacts.length,
                },
            });

            return res.status(200).json(payload);
        } catch (error) {
            logger.error("getSiteAlerts error", {
                error,
                meta: { requestId, organizationId, userId },
            });

            return res.status(500).json({ message: "Server error" });
        }
    },
    getAllEmployees: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required." });
            }

            // 1. Verify org exists (optional but recommended)
            const orgExists = await prisma.organizations.findUnique({
                where: { organization_id },
                select: { organization_id: true, name: true }
            });
            if (!orgExists) {
                return res.status(404).json({ message: "Organization not found." });
            }

            // 2. Fetch active users belonging to this organization
            const employees = await prisma.users.findMany({
                where: {
                    organization_id,
                    is_active: true
                },
                select: {
                    user_id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    phone_number: true,
                    role: {
                        select: { role_name: true }
                    },
                    site: {
                        select: { name: true }
                    },
                    area: {
                        select: { name: true }
                    }
                },
                orderBy: { created_at: "desc" }
            });

            return res.status(200).json({
                organization: { id: orgExists.organization_id, name: orgExists.name },
                total_employees: employees.length,
                employees
            });
        } catch (error) {
            logger.error("getAllEmployees error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    toggleEmployeeStatus: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            const parsedParams = toggleEmployeeStatusParamsSchema.safeParse(req.params ?? {});
            const parsedBody = toggleEmployeeStatusBodySchema.safeParse(req.body ?? {});

            if (!parsedParams.success || (req.body?.status === undefined && !parsedBody.success)) {
                return res.status(400).json({ message: "userId (path param) and status are required." });
            }
            const { userId } = parsedParams.success ? parsedParams.data : { userId: null };

            if (!parsedBody.success) {
                return res.status(400).json({ message: "Invalid status value. Must be 'activate' or 'deactivate'." });
            }
            const { status } = parsedBody.data;

            const user = await prisma.users.findFirst({
                where: { user_id: userId, organization_id },
                select: { user_id: true, is_active: true },
            });

            if (!user) {
                return res.status(404).json({ message: "User not found." });
            }

            const newActiveState = status === 'activate';

            if (user.is_active === newActiveState) {
                return res.status(409).json({ message: `User is already ${status}d.` });
            }

            await prisma.users.update({
                where: { user_id: userId },
                data: { is_active: newActiveState },
            });

            return res.status(200).json({ message: `User successfully ${status}d.` });

        } catch (error) {
            logger.error("toggleEmployeeStatus error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getContractingActiveEmployees: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const parsedParams = companyIdParamSchema.safeParse(req.params ?? {});

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            if (!parsedParams.success) {
                return res.status(400).json({ message: "companyId is required" });
            }
            const { companyId } = parsedParams.data;

            // Check if the contracting company belongs to the organization
            const company = await prisma.contracting_Companies.findFirst({
                where: {
                    id: companyId,
                    organization_id,
                },
            });

            if (!company) {
                return res.status(404).json({ message: "Contracting company not found for the given organization" });
            }

            // Count active contractor users
            const active_user_count = await prisma.contractors.count({
                where: {
                    contracting_company_id: companyId,
                    user: {
                        is_active: true,
                    },
                },
            });

            return res.json({ active_user_count });
        } catch (err) {
            logger.error("getContractingActiveEmployees error:", err);
            return res.status(500).json({ message: "Something went wrong", error: err.message });
        }
    },
    getOrganizationOverview: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            const [
                permanent_employees,
                contractors,
                pending_verifications,
            ] = await Promise.all([
                // ✅ Permanent employees (NOT contractors)
                prisma.users.count({
                    where: {
                        organization_id,
                        user_type: "employee",
                        is_active: true,
                    },
                }),

                // ✅ Contractors (separate table)
                prisma.contractors.count({
                    where: {
                        contracting_company: {
                            organization_id,
                        },
                        // (optional) if you have active flag in contractors table:
                        // is_active: true,
                    },
                }),

                // ✅ Pending verifications (all active users in org with phone not verified)
                prisma.users.count({
                    where: {
                        organization_id,
                        phone_verified: false,
                        is_active: true,
                    },
                }),
            ]);

            const total_employees = permanent_employees + contractors;

            return res.status(200).json({
                total_employees,        // ✅ permanent + contractors
                permanent_employees,    // ✅ employees only
                contractors,            // ✅ contractors only
                pending_verifications,
            });
        } catch (err) {
            logger.error("getOrganizationOverview error:", err);
            return res.status(500).json({
                message: "Something went wrong",
                error: err.message,
            });
        }
    },
    getFilterValues: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            const sites = await prisma.sites.findMany({ where: { organization_id } });
            const roles = await prisma.roles.findMany();

            return res.json({ sites, roles });
        }
        catch (err) {
            logger.error("getFilterValues error:", err);
            return res.status(500).json({ message: "Something went wrong", error: err?.message });
        }
    },
    employeeDetails: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const { userId } = req.params;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            if (!userId) {
                return res.status(400).json({ message: "userId is required" });
            }

            const check_user = await prisma.users.findFirst({
                where: { user_id: userId, organization_id },
                select: { user_id: true },
            });

            if (!check_user) {
                return res.status(404).json({ message: "User doesnt exist" });
            }

            const employee_details = await prisma.users.findUnique({
                where: { user_id: userId },
                include: {
                    organization: { select: { name: true } },
                    role: { select: { role_name: true } },
                    site: { select: { name: true } },
                    area: { select: { name: true } },
                },
            });

            const alert_history = await prisma.notification_Recipients.findMany({
                where: { user_id: userId },
                include: { alert: { include: { emergency_type: true } } },
            });

            const alert_data = alert_history.map(i => {
                const delivered_at = moment(i.delivered_at);
                const response_updated_at = i.response_updated_at
                    ? moment(i.response_updated_at)
                    : null;

                let elapsed = null;
                if (delivered_at.isValid() && response_updated_at?.isValid()) {
                    elapsed = response_updated_at.diff(delivered_at, 'seconds');
                }
                return {
                    name: i.alert.emergency_type.name,
                    date: delivered_at.format('YYYY-MM-DD'),
                    time: delivered_at.format('HH:mm:ss'),
                    response_elapsed_time: elapsed,
                    message: i.alert.message,
                };
            });

            return res.json({ alert_history: alert_data, employee_details });
        } catch (err) {
            logger.error("employeeDetails error:", err);
            return res.status(500).json({ message: err.message });
        }
    },
    getEmployees: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const {
                search = '',
                status = '',
                roles = '',
                sites = '',
                page = 1,
                limit = 20,
            } = req.query;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }
            const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
            const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
            const skip = (pageNumber - 1) * pageSize;
            const take = pageSize;
            const normalizedSearch = String(search || "").trim().slice(0, 100);
            const roleIds = String(roles || "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .slice(0, 50);
            const siteIds = String(sites || "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .slice(0, 50);

            const where = {
                organization_id,
                // Optional active/inactive status
                ...(status
                    ? { is_active: status === 'active' }
                    : {}),

                // Optional role filter
                ...(roleIds.length > 0
                    ? { role_id: { in: roleIds } }
                    : {}),

                // Optional site filter
                ...(siteIds.length > 0
                    ? { site_id: { in: siteIds } }
                    : {}),

                // Optional search filter (name, email, phone)
                ...(normalizedSearch
                    ? {
                        OR: [
                            { first_name: { contains: normalizedSearch, mode: 'insensitive' } },
                            { last_name: { contains: normalizedSearch, mode: 'insensitive' } },
                            { email: { contains: normalizedSearch, mode: 'insensitive' } },
                            { phone_number: { contains: normalizedSearch, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
            };

            // Total count for pagination
            const total_count = await prisma.users.count({ where });

            const role_details = await prisma.roles.findMany({ select: { id: true, role_name: true } })
            const users = await prisma.users.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    is_active: true,
                    user_type: true,
                    phone_number: true,
                    site: {
                        select: {
                            name: true,
                        },
                    },
                    area: {
                        select: {
                            name: true,
                        },
                    },
                    role: {
                        select: {
                            role_name: true,
                            id: true
                        },
                    },
                    contractors: {
                        select: {
                            contracting_company: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            const results = users.map(user => {
                const is_employee = user.user_type === 'employee';

                return {
                    user_id: user.user_id,
                    first_name: user.first_name,

                    last_name: user.last_name,
                    email: user.email,
                    status: user.is_active ? 'Active' : 'Inactive',
                    site_name: user.site?.name || null,
                    area_name: user.area?.name || null,
                    is_employee,
                    company_name: !is_employee ? user.contractors?.[0]?.contracting_company?.name || null : null,
                    phone: user.phone_number,
                    role: user.role?.role_name === 'admin' ? 'admin' : 'employee',
                    role_id: user?.role_id || null,
                    roles: role_details
                };
            });

            return res.status(200).json({
                total_count,
                employees: results,
            });
        } catch (err) {
            logger.error("getEmployees error:", err);
            return res.status(500).json({
                message: 'Something went wrong',
                error: err.message,
            });
        }
    },
    editEmployee: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const { userId } = req.params;
            const {
                first_name,
                last_name,
                email,
                phone,
                role_id,
                site_id,
                area_id,
                user_type,        // "EMPLOYEE" or "CONTRACTOR"
                company_id        // required if user_type is CONTRACTOR
            } = req.body;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }
            if (!userId) return res.status(400).json({ message: "userId is required" });

            const user = await prisma.users.findFirst({ where: { user_id: userId, organization_id } });
            if (!user) return res.status(404).json({ message: "User not found" });

            // Check if new email is already in use
            if (email && email.toLowerCase() !== user.email.toLowerCase()) {
                const existing = await prisma.users.findUnique({ where: { email: email.toLowerCase() } });
                if (existing) return res.status(409).json({ message: "Email is already in use" });
            }

            // Check if role exists if passed
            if (role_id) {
                const roleExists = await prisma.roles.findUnique({ where: { id: role_id } });
                if (!roleExists) return res.status(400).json({ message: "Invalid role_id" });
            }

            // Build update data dynamically
            const updates = {};
            if (first_name) updates.first_name = first_name;
            if (last_name) updates.last_name = last_name;
            if (email) updates.email = email.toLowerCase();
            if (phone) updates.phone_number = phone;
            if (role_id) updates.role_id = role_id;
            if (site_id) updates.site_id = site_id;
            if (area_id) updates.area_id = area_id;
            if (user_type) updates.user_type = user_type;

            // Handle user_type change (EMPLOYEE <-> CONTRACTOR)
            if (user_type && user.user_type !== user_type) {
                if (user_type === "employee") {
                    await prisma.contractors.deleteMany({ where: { user_id: userId } });
                    await prisma.employees.create({ data: { user_id: userId } });
                } else if (user_type === "contractor") {
                    if (!company_id) return res.status(400).json({ message: "company_id is required for contractors" });
                    await prisma.employees.deleteMany({ where: { user_id: userId } });
                    await prisma.contractors.create({
                        data: {
                            user_id: userId,
                            contracting_company_id: company_id,
                        },
                    });
                } else {
                    return res.status(400).json({ message: "Invalid user_type" });
                }
            }

            const updatedUser = await prisma.users.update({
                where: { user_id: userId },
                data: updates,
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true,
                    user_type: true,
                    role: { select: { role_name: true } },
                },
            });

            return res.status(200).json({
                message: "User updated successfully",
                user: {
                    id: updatedUser.user_id,
                    name: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
                    email: updatedUser.email,
                    phone: updatedUser.phone_number,
                    role: updatedUser.role?.role_name,
                    type: updatedUser.user_type,
                },
            });
        } catch (error) {
            logger.error("editEmployee error:", error);
            return res.status(500).json({ message: "Server error" });
        }
    },
    deleteContractingCompany: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const { companyId } = req.params;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            if (!companyId) {
                return res.status(400).json({ message: "companyId is required" });
            }

            const contracting_company = await prisma.contracting_Companies.findFirst({
                where: { id: companyId, organization_id },
            });

            if (!contracting_company) {
                return res.status(404).json({ message: "Contracting company not found" });
            }

            await prisma.contracting_Companies.delete({ where: { id: companyId } });

            return res.status(200).json({ message: "Contracting company deleted successfully" });
        } catch (error) {
            logger.error("deleteContractingCompany error:", error);
            return res.status(500).json({ message: "Server error" });
        }
    },
    getSitesCards: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Run counts in parallel for speed
            const [total_sites, active_sites, total_areas, current_occupancy] = await Promise.all([
                prisma.sites.count({
                    where: { organization_id },
                }),
                prisma.sites.count({
                    where: { organization_id, is_active: true },
                }),
                prisma.areas.count({
                    where: {
                        site: { organization_id },
                    },
                }),
                prisma.users.count({
                    where: {
                        organization_id,
                        is_active: true,
                    },
                }),
            ]);

            return res.json({
                total_sites,
                active_sites,        // ✅ new field
                total_areas,
                current_occupancy,
            });
        } catch (error) {
            logger.error('getSitesCards error:', error);
            return res.status(500).json({
                error: 'Internal server error',
            });
        }
    },
    searchSites: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const {
                name = '',
                status,              // allow default 'all'
                page = '1',
                page_size = '10',
            } = req.query;

            if (!organization_id) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const normalizedStatus = String(status).toLowerCase();
            const allowed = ['active', 'inactive', 'all'];
            if (!allowed.includes(normalizedStatus)) {
                return res
                    .status(400)
                    .json({ error: "Invalid status. Must be 'active', 'inactive', or 'all'." });
            }

            const pageNum = Math.max(parseInt(page, 10) || 1, 1);
            const pageSizeNum = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 100);
            const skip = (pageNum - 1) * pageSizeNum;
            const take = pageSizeNum;

            // ---- Build WHERE ----
            const where = {
                organization_id,
                ...(normalizedStatus !== 'all' && {
                    is_active: normalizedStatus === 'active',
                }),
                ...(name.trim() && {
                    name: { contains: name.trim(), mode: 'insensitive' },
                }),
            };

            // ---- Count ----
            const total = await prisma.sites.count({ where });

            if (total === 0) {
                return res.json({
                    data: [],
                    meta: { page: pageNum, page_size: pageSizeNum, total: 0 },
                });
            }

            // ---- Fetch sites ----
            const sites = await prisma.sites.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' }, // newest first
                select: {
                    id: true,
                    name: true,
                    is_active: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    _count: {
                        select: {
                            Users: true,
                            Areas: true,
                        },
                    },
                },
            });

            // ---- Shape response ----
            const data = sites.map((s) => ({
                id: s.id,
                name: s.name,
                address: [s.address_line_1, s.address_line_2, s.city, s.state, s.zip_code]
                    .filter(Boolean)
                    .join(', '),
                total_people: s._count.Users,
                total_areas: s._count.Areas,
                status: s.is_active ? 'active' : 'inactive',
            }));

            return res.json({
                data,
                meta: { page: pageNum, page_size: pageSizeNum, total },
            });
        } catch (error) {
            logger.error('searchSites error:', error);
            return res.status(500).json({
                error: 'Internal server error',
            });
        }
    },
    createSite: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return res.status(403).json({
                    message: "You don’t have permission to create a site.",
                });
            }

            const parsed = createSiteSchema.parse(req.body);

            const normalizedAreas = (parsed.areas ?? [])
                .map((a) => ({
                    name: a.name.trim(),
                    description: a.description?.trim() || null,
                }))
                .filter((a) => a.name.length > 0);

            const seen = new Set();
            for (const area of normalizedAreas) {
                const key = area.name.toLowerCase();
                if (seen.has(key)) {
                    return res.status(400).json({
                        message: "Area names must be unique. Please remove duplicate area names and try again.",
                    });
                }
                seen.add(key);
            }

            const result = await prisma.$transaction(async (tx) => {
                const site = await tx.sites.create({
                    data: {
                        organization_id,
                        name: parsed.site_name.trim(),
                        address_line_1: parsed.address.trim(),
                        address_line_2: parsed.address_line_2?.trim() || null,
                        city: parsed.city.trim(),
                        state: parsed.state.trim(),
                        zip_code: parsed.zipcode.trim(),
                        contact_name: parsed.site_contact_name.trim(),
                        contact_email: parsed.contact_email.trim().toLowerCase(),
                        contact_phone: parsed.contact_phone?.trim() || null,
                    },
                });

                if (normalizedAreas.length > 0) {
                    await tx.areas.createMany({
                        data: normalizedAreas.map((a) => ({
                            site_id: site.id,
                            name: a.name,
                            description: a.description,
                        })),
                    });
                }

                return tx.sites.findUnique({
                    where: { id: site.id },
                    include: {
                        Areas: { orderBy: { created_at: "asc" } },
                    },
                });
            });

            return res.status(201).json({
                message: "Site created successfully.",
                data: result,
            });
        } catch (error) {
            if (error.name === "ZodError") {
                return res.status(400).json({
                    message: "Please check the highlighted fields and try again.",
                    errors: error.errors,
                });
            }

            if (error.code === "P2002") {
                const fields = error.meta?.target || [];

                if (fields.includes("contact_email")) {
                    return res.status(409).json({
                        message: "This contact email is already being used for another site.",
                    });
                }

                if (fields.includes("contact_phone")) {
                    return res.status(409).json({
                        message: "This contact phone number is already being used for another site.",
                    });
                }

                return res.status(409).json({
                    message: "Some site details already exist. Please review and try again.",
                });
            }

            logger.error("createSite error:", error);

            return res.status(500).json({
                message: "We couldn’t create the site right now. Please try again.",
            });
        }
    },
    updateSite: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const siteId = siteIdParamSchema.parse(req.params.id);

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            const parsed = updateSiteSchema.parse(req.body);

            // 1) Ensure site exists and belongs to org
            const existing = await prisma.sites.findFirst({
                where: { id: siteId, organization_id },
                include: { Areas: true },
            });

            if (!existing) {
                return res.status(404).json({ error: "Site not found" });
            }

            // 2) Build update payload (only provided fields)
            const data = {
                ...(parsed.site_name !== undefined ? { name: parsed.site_name } : {}),
                ...(parsed.address !== undefined ? { address_line_1: parsed.address } : {}),
                ...(parsed.address_line_2 !== undefined ? { address_line_2: parsed.address_line_2 ?? null } : {}),
                ...(parsed.city !== undefined ? { city: parsed.city } : {}),
                ...(parsed.state !== undefined ? { state: parsed.state } : {}),
                ...(parsed.zipcode !== undefined ? { zip_code: parsed.zipcode } : {}),
                ...(parsed.site_contact_name !== undefined ? { contact_name: parsed.site_contact_name } : {}),
                ...(parsed.contact_email !== undefined ? { contact_email: parsed.contact_email } : {}),
                ...(parsed.contact_phone !== undefined ? { contact_phone: parsed.contact_phone ?? null } : {}),
                ...(parsed.is_active !== undefined ? { is_active: parsed.is_active } : {}),
            };

            // 3) Transaction: update site + (optionally) replace areas
            const updated = await prisma.$transaction(async (tx) => {
                await tx.sites.update({
                    where: { id: siteId },
                    data,
                });

                if (parsed.areas) {
                    // Replace all existing areas
                    await tx.areas.deleteMany({ where: { site_id: siteId } });

                    if (parsed.areas.length > 0) {
                        await tx.areas.createMany({
                            data: parsed.areas.map((a) => ({
                                site_id: siteId,
                                name: a.name,
                                description: a.description ?? null,
                            })),
                        });
                    }
                }

                // Return fresh site with areas
                return tx.sites.findUnique({
                    where: { id: siteId },
                    include: { Areas: true },
                });
            });

            return res.status(200).json(updated);
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({ error: error.errors });
            }
            logger.error("updateSite error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    },
    deleteSite: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const siteId = siteIdParamSchema.parse(req.params.id);

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            // 1) Ensure exists and belongs to org
            const existing = await prisma.sites.findFirst({
                where: { id: siteId, organization_id },
                select: { id: true },
            });

            if (!existing) {
                return res.status(404).json({ error: "Site not found" });
            }

            // 2) Delete in a transaction to avoid FK issues
            // NOTE: Areas has required relation to site, so delete areas first unless you set onDelete: Cascade.
            await prisma.$transaction(async (tx) => {
                // Remove dependent children first (adjust based on your DB constraints)
                await tx.areas.deleteMany({ where: { site_id: siteId } });

                // If Users references site_id, you must decide:
                // A) block delete if users exist
                // B) set users.site_id = null
                // Here: set to null (recommended)
                await tx.users.updateMany({
                    where: { site_id: siteId },
                    data: { site_id: null, area_id: null },
                });

                // Remove Alert_Sites join rows if you allow deleting sites that were targeted by alerts
                await tx.alert_Sites.deleteMany({ where: { site_id: siteId } });

                // Finally delete site
                await tx.sites.delete({ where: { id: siteId } });
            });

            return res.status(200).json({ message: "Site deleted successfully" });
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({ error: error.errors });
            }
            logger.error("deleteSite error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    },
    createArea: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            const parsed = createAreaSchema.parse(req.body);

            // ✅ check if site exists and belongs to org
            const site = await findSiteForOrganization(
                prisma,
                parsed.site_id,
                organization_id,
                { id: true },
            );

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // ✅ create area
            const area = await prisma.areas.create({
                data: {
                    site_id: parsed.site_id,
                    name: parsed.name,
                    description: parsed.description ?? null,
                },
            });

            return res.status(200).json(area);
        } catch (error) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ error: error.errors });
            }
            logger.error('createArea error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    updateArea: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const areaId = areaIdParamSchema.parse(req.params.id);

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            const parsed = updateAreaSchema.parse(req.body);

            // ✅ check area exists and belongs to org
            const existingArea = await prisma.areas.findFirst({
                where: { id: areaId, site: { organization_id } },
                select: { id: true },
            });

            if (!existingArea) {
                return res.status(404).json({ error: "Area not found" });
            }

            // ✅ if site_id provided, ensure site belongs to org
            if (parsed.site_id) {
                const site = await findSiteForOrganization(
                    prisma,
                    parsed.site_id,
                    organization_id,
                    { id: true },
                );

                if (!site) {
                    return res.status(404).json({ error: "Site not found" });
                }
            }

            // ✅ build update payload (only fields provided)
            const data = {
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.description !== undefined ? { description: parsed.description ?? null } : {}),
                ...(parsed.site_id !== undefined ? { site_id: parsed.site_id } : {}),
            };

            const updatedArea = await prisma.areas.update({
                where: { id: areaId },
                data,
            });

            return res.status(200).json(updatedArea);
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({ error: error.errors });
            }
            logger.error("updateArea error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    },
    deleteArea: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const areaId = areaIdParamSchema.parse(req.params.id);

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            // ✅ check area exists and belongs to org
            const existingArea = await prisma.areas.findFirst({
                where: { id: areaId, site: { organization_id } },
                select: { id: true },
            });

            if (!existingArea) {
                return res.status(404).json({ error: "Area not found" });
            }

            // ✅ If Users references area_id, we must detach them first (area_id is nullable in your schema)
            await prisma.$transaction(async (tx) => {
                await tx.users.updateMany({
                    where: { area_id: areaId },
                    data: { area_id: null },
                });

                // remove any alert-area joins
                await tx.alert_Areas.deleteMany({
                    where: { area_id: areaId },
                });

                // finally delete area
                await tx.areas.delete({
                    where: { id: areaId },
                });
            });

            return res.status(200).json({ message: "Area deleted successfully" });
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({ error: error.errors });
            }
            logger.error("deleteArea error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    },
    siteOverview: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const site_id = req.params.siteId;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            if (!ensureSiteIdOrError(res, site_id)) {
                return;
            }

            // fetch site + areas + user counts (enforce org ownership)
            const site = await findSiteForOrganization(
                prisma,
                site_id,
                organization_id,
                {
                    id: true,
                    name: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    Areas: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            _count: {
                                select: { Users: true },
                            },
                        },
                        orderBy: { name: 'asc' },
                    },
                },
            );

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // === Parallel counts ===
            const [employeesCount, contractorsCount, adminsCount] = await Promise.all([
                prisma.employees.count({ where: { user: { site_id } } }),
                prisma.contractors.count({ where: { user: { site_id } } }),
                prisma.users.count({
                    where: {
                        site_id,
                        role: { role_name: { equals: 'admin', mode: 'insensitive' } },
                    },
                }),
            ]);

            // optional: users not assigned to any area
            const unassignedUsers = await prisma.users.findMany({
                where: { site_id, area_id: null },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true,
                    is_active: true,
                    user_type: true,
                },
                orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
            });

            return res.json({
                site_name: site.name,
                address: buildSiteAddress(site),
                employees: employeesCount,
                contractors: contractorsCount,
                admins: adminsCount, // ✅ added field
                areas: site.Areas.map((a) => ({
                    id: a.id,
                    name: a.name,
                    description: a.description,
                    user_count: a._count.Users,
                })),
                unassigned_users: unassignedUsers,
            });
        } catch (error) {
            logger.error('siteOverview error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    sitePopupOverview: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const site_id = req.params.siteId;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            if (!ensureSiteIdOrError(res, site_id)) {
                return;
            }

            // ✅ fetch basic site info with counts (enforce org ownership)
            const site = await findSiteForOrganization(
                prisma,
                site_id,
                organization_id,
                {
                    id: true,
                    name: true,
                    is_active: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    contact_name: true,
                    contact_email: true,
                    _count: {
                        select: {
                            Users: true,
                            Areas: true,
                            Alert_Sites: true,
                        },
                    },
                },
            );

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // ✅ average response time
            // join: Alert_Sites → Alerts → Notification_Recipients
            const responses = await prisma.notification_Recipients.findMany({
                where: {
                    alert: {
                        Alert_Sites: {
                            some: { site_id },
                        },
                    },
                    response_updated_at: { not: null },
                },
                select: {
                    created_at: true,
                    response_updated_at: true,
                },
            });

            let avgResponseTime = null;
            if (responses.length > 0) {
                const diffs = responses.map(r =>
                    (r.response_updated_at - r.created_at) / 1000 // seconds
                );
                avgResponseTime = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            }

            // ✅ shape response
            return res.json({
                site_name: site.name,
                status: site.is_active ? 'active' : 'inactive',
                current_count: site._count.Users,
                areas: site._count.Areas,
                total_alerts: site._count.Alert_Sites,
                average_response_time: avgResponseTime, // in seconds
                address: buildSiteAddress(site),
                contact_name: site.contact_name,
                contact_email: site.contact_email,
            });
        } catch (error) {
            logger.error('sitePopupOverview error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    sitePopupAreas: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const site_id = req.params.siteId;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            if (!ensureSiteIdOrError(res, site_id)) {
                return;
            }

            // ✅ fetch site and its areas (enforce org ownership)
            const site = await findSiteForOrganization(
                prisma,
                site_id,
                organization_id,
                {
                    id: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    Areas: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            );

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            const fullAddress = buildSiteAddress(site);
            const areaIds = site.Areas.map((area) => area.id);

            let employeeCountByArea = new Map();
            let contractorCountByArea = new Map();

            if (areaIds.length > 0) {
                // Batch counts per area to avoid per-area N+1 queries.
                const [employeeCountsRaw, contractorCountsRaw] = await Promise.all([
                    prisma.$queryRaw`
            SELECT u.area_id::text AS area_id, COUNT(e.user_id)::int AS count
            FROM "Employees" e
            INNER JOIN "Users" u ON u.user_id = e.user_id
            WHERE u.area_id = ANY(${areaIds}::uuid[])
            GROUP BY u.area_id
          `,
                    prisma.$queryRaw`
            SELECT u.area_id::text AS area_id, COUNT(c.user_id)::int AS count
            FROM "Contractors" c
            INNER JOIN "Users" u ON u.user_id = c.user_id
            WHERE u.area_id = ANY(${areaIds}::uuid[])
            GROUP BY u.area_id
          `,
                ]);

                employeeCountByArea = new Map(
                    employeeCountsRaw.map((row) => [row.area_id, Number(row.count)]),
                );
                contractorCountByArea = new Map(
                    contractorCountsRaw.map((row) => [row.area_id, Number(row.count)]),
                );
            }

            const areasData = site.Areas.map((area) => ({
                area_name: area.name,
                address: fullAddress,
                num_employees: employeeCountByArea.get(area.id) ?? 0,
                num_contractors: contractorCountByArea.get(area.id) ?? 0,
                route: area.id,
            }));

            return res.status(200).json(areasData);
        } catch (error) {
            logger.error('sitePopupAreas error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    sitePopupEmployees: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const site_id = req.params.siteId;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            if (!ensureSiteIdOrError(res, site_id)) {
                return;
            }

            // Fetch site to build address once (enforce org ownership)
            const site = await findSiteForOrganization(
                prisma,
                site_id,
                organization_id,
                {
                    id: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                },
            );
            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            const areaAddress = buildSiteAddress(site);

            // Get users at this site who are employees
            const users = await prisma.users.findMany({
                where: {
                    site_id,
                    // only employees (has related Employees row)
                    employee: { isNot: null },
                },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    area: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: { first_name: 'asc' },
            });

            const employees = users.map(u => ({
                user_id: u.user_id,
                first_name: u.first_name,
                last_name: u.last_name,
                area_name: u.area?.name || null,
                area_address: areaAddress,
            }));

            return res.status(200).json(employees);
        } catch (error) {
            logger.error('sitePopupEmployees error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    getSitePopupAlerts: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const site_id = req.params.siteId;

            if (!ensureAdminOrganizationOrError(res, organization_id)) {
                return;
            }

            if (!ensureSiteIdOrError(res, site_id)) {
                return;
            }

            // Verify site belongs to org
            const siteExists = await findSiteForOrganization(
                prisma,
                site_id,
                organization_id,
                { id: true },
            );

            if (!siteExists) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // Fetch alerts for this site with areas + recipients
            const alerts = await prisma.alerts.findMany({
                where: {
                    organization_id,
                    Alert_Sites: {
                        some: { site_id }
                    }
                },
                include: {
                    Alert_Areas: {
                        include: {
                            area: true
                        }
                    },
                    Notification_Recipients: true,
                    emergency_type: true,
                },
                orderBy: { created_at: 'desc' }
            });

            const response = alerts.map(alert => {
                // counts
                const safeCount = alert.Notification_Recipients.filter(r => r.response === "SAFE").length;
                const unsafeCount = alert.Notification_Recipients.filter(r => r.response === "NOT_SAFE").length;
                const notRespondedCount = alert.Notification_Recipients.filter(r => !r.response).length;

                // duration (minutes)
                let duration = null;
                if (alert.start_time && alert.end_time) {
                    duration = differenceInMinutes(new Date(alert.end_time), new Date(alert.start_time));
                }

                return {
                    alert_id: alert.id,
                    name: alert.message || alert.emergency_type?.name,
                    status: alert.status,
                    start_time: alert.start_time,
                    duration_minutes: duration,
                    areas: alert.Alert_Areas.map(a => ({
                        name: a.area.name,
                        address: a.area.description
                    })),
                    counts: {
                        safe: safeCount,
                        unsafe: unsafeCount,
                        not_responded: notRespondedCount
                    }
                };
            });

            res.json(response);
        } catch (error) {
            logger.error("getSitePopupAlerts error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    },
    getAlertHistory: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
            const take = Math.min(Math.max(parseInt(req.query.per_page, 10) || 10, 1), 100);
            const skip = (page - 1) * take;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // ✅ Only resolved alerts for history
            const whereResolved = {
                organization_id: String(organization_id),
                AND: [
                    { status: "resolved" },         // enum AlertStatus.resolved
                    { resolved_at: { not: null } }, // safety
                ],
                // Optional: ensure it truly ended
                // end_time: { not: null },
            };

            const total = await prisma.alerts.count({
                where: whereResolved,
            });

            const alerts = await prisma.alerts.findMany({
                where: whereResolved,
                orderBy: [{ resolved_at: "desc" }, { end_time: "desc" }, { created_at: "desc" }],
                skip,
                take,
                select: {
                    id: true,
                    message: true,
                    severity: true,
                    start_time: true,
                    end_time: true,
                    resolved_at: true,
                    resolution_notes: true,
                    resolution_reason: {
                        select: {
                            reason_code: true,
                            reason_description: true,
                        },
                    },
                    emergency_type: { select: { name: true } },
                    Notification_Recipients: { select: { response: true } },
                },
            });

            const data = alerts.map((a) => {
                const recipients = a.Notification_Recipients || [];
                let safe = 0;
                let needHelp = 0;
                let emergency = 0;

                for (const r of recipients) {
                    switch (r.response) {
                        case "safe":
                            safe++;
                            break;
                        case "seeking_shelter":
                        case "need_help":
                            needHelp++;
                            break;
                        case "not_safe":
                        case "evacuated":
                        case "emergency_help_needed":
                            emergency++;
                            break;
                        default:
                            break; // null/undefined = not responded
                    }
                }

                const notResponded = Math.max(0, recipients.length - (safe + needHelp + emergency));

                return {
                    id: a.id,
                    emergency_type: a.emergency_type?.name ?? null,
                    message: a.message,
                    severity: a.severity,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    resolved_at: a.resolved_at,
                    resolution_reason: a.resolution_reason
                        ? {
                            code: a.resolution_reason.reason_code,
                            description: a.resolution_reason.reason_description,
                        }
                        : null,
                    resolution_notes: a.resolution_notes ?? null,

                    safe_responded_count: safe,
                    need_help_count: needHelp,
                    emergency_count: emergency,
                    not_responded_count: notResponded,
                };
            });

            return res.status(200).json({
                data,
                meta: {
                    page,
                    per_page: take,
                    total,
                    total_pages: Math.ceil(total / take),
                },
            });
        } catch (error) {
            logger.error("getAlertHistory error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getScheduledAlerts: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // Fetch all alerts with status = "scheduled"
            const scheduledAlerts = await prisma.alerts.findMany({
                where: {
                    organization_id,
                    status: "scheduled",
                },
                orderBy: [{ scheduled_time: "desc" }],
                select: {
                    id: true,
                    message: true,
                    severity: true,
                    start_time: true,
                    end_time: true,
                    scheduled_time: true,
                    emergency_type: {
                        select: { name: true },
                    },
                    Notification_Recipients: {
                        select: { response: true },
                    },
                },
            });

            // Transform response
            const data = scheduledAlerts.map((alert) => ({
                id: alert.id,
                emergency_type: alert.emergency_type ? alert.emergency_type.name : null,
                message: alert.message,
                severity: alert.severity,
                scheduled_time: alert.scheduled_time,
                start_time: alert.start_time,
                end_time: alert.end_time,
                total_recipients: alert.Notification_Recipients.length,
            }));

            return res.status(200).json({
                total: data.length,
                data,
            });
        } catch (error) {
            logger.error("getScheduledAlerts error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getSiteAnalyticsCard: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // === Total Alerts ===
            const total_alerts = await prisma.alerts.count({
                where: { organization_id },
            });

            // === Average Response Time ===
            const responses = await prisma.notification_Recipients.findMany({
                where: {
                    alert: { organization_id },
                    acknowledged_at: { not: null },
                },
                select: {
                    acknowledged_at: true,
                    created_at: true,
                },
            });

            let avg_response_time = null;

            if (responses.length > 0) {
                const total_ms = responses.reduce((sum, r) => {
                    const diff = new Date(r.acknowledged_at) - new Date(r.created_at);
                    return sum + diff;
                }, 0);

                // convert to minutes instead of seconds
                const avg_ms = total_ms / responses.length;
                const avg_minutes = avg_ms / (1000 * 60);
                avg_response_time = avg_minutes.toFixed(2); // minutes with 2 decimals
            }

            return res.status(200).json({
                organization_id,
                total_alerts,
                avg_response_time: avg_response_time ? `${avg_response_time} min` : "N/A",
            });
        } catch (error) {
            logger.error("getSiteAnalyticsCard error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getSitePerformance: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            let { page = "1", page_size = "10" } = req.query;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // Normalize pagination params
            const pageNum = Math.max(parseInt(page, 10) || 1, 1);
            const pageSizeNum = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 100); // cap to 100

            // Total sites (for meta)
            const total_sites = await prisma.sites.count({
                where: { organization_id },
            });

            const total_pages = Math.max(Math.ceil(total_sites / pageSizeNum), 1);
            const skip = (pageNum - 1) * pageSizeNum;

            // Page of sites with counts (avoids extra queries for users/alerts count)
            const sitesPage = await prisma.sites.findMany({
                where: { organization_id },
                orderBy: { created_at: "desc" },         // adjust ordering if needed
                skip,
                take: pageSizeNum,
                select: {
                    id: true,
                    name: true,
                    _count: {
                        select: {
                            Users: true,        // total_people
                            Alert_Sites: true,  // num_of_alerts (links to alerts)
                        },
                    },
                },
            });

            // If no sites in this page
            if (sitesPage.length === 0) {
                return res.status(200).json({
                    organization_id,
                    pagination: {
                        page: pageNum,
                        page_size: pageSizeNum,
                        total_sites,
                        total_pages,
                        has_prev: pageNum > 1,
                        has_next: pageNum < total_pages,
                    },
                    site_performance: [],
                });
            }

            // Collect site ids for this page
            const siteIds = sitesPage.map(s => s.id);

            // Map site_id -> alert_ids (batched)
            const alertLinks = await prisma.alert_Sites.findMany({
                where: { site_id: { in: siteIds } },
                select: { site_id: true, alert_id: true },
            });

            const siteToAlertIds = new Map();  // site_id -> Set(alert_id)
            const alertIdToSiteId = new Map(); // alert_id -> site_id (for back mapping)
            for (const { site_id, alert_id } of alertLinks) {
                if (!siteToAlertIds.has(site_id)) siteToAlertIds.set(site_id, new Set());
                siteToAlertIds.get(site_id).add(alert_id);
                // If an alert is linked to multiple sites, last one wins – but we only need site-level aggregation.
                // We’ll instead aggregate per-site using siteToAlertIds below, so this map is optional.
                alertIdToSiteId.set(alert_id, site_id);
            }

            // Collect all alert ids on this page of sites
            const allAlertIds = [...new Set(alertLinks.map(a => a.alert_id))];

            // Fetch responders for those alert ids (response not null) in one query
            // We will aggregate unique responders per site in JS
            let responders = [];
            if (allAlertIds.length > 0) {
                responders = await prisma.notification_Recipients.findMany({
                    where: {
                        alert_id: { in: allAlertIds },
                        response: { not: null },
                    },
                    select: {
                        alert_id: true,
                        user_id: true,
                    },
                });
            }

            // Build site_id -> Set(user_id) of responders (unique per site)
            const siteToResponderSet = new Map();
            for (const r of responders) {
                const siteId = alertIdToSiteId.get(r.alert_id);
                if (!siteId) continue;
                if (!siteToResponderSet.has(siteId)) siteToResponderSet.set(siteId, new Set());
                siteToResponderSet.get(siteId).add(r.user_id);
            }

            // Final shaping
            const site_performance = sitesPage.map(site => {
                const total_people = site._count.Users || 0;
                const num_of_alerts = site._count.Alert_Sites || 0;

                const uniqueResponders = siteToResponderSet.get(site.id)?.size || 0;
                const performancePct =
                    total_people > 0 ? ((uniqueResponders / total_people) * 100).toFixed(2) : "0.00";

                return {
                    site_name: site.name,
                    num_of_alerts,
                    total_people,
                    performance: `${performancePct}%`,
                };
            });

            return res.status(200).json({
                organization_id,
                pagination: {
                    page: pageNum,
                    page_size: pageSizeNum,
                    total_sites,
                    total_pages,
                    has_prev: pageNum > 1,
                    has_next: pageNum < total_pages,
                },
                site_performance,
            });
        } catch (error) {
            logger.error("getSitePerformance error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getAlertDistribution: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // 1) Fetch all Emergency Types for this org
            const types = await prisma.emergency_Types.findMany({
                where: { organization_id },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            });

            if (types.length === 0) {
                return res.status(200).json({
                    organization_id,
                    total_alerts: 0,
                    alert_types: [],              // labels
                    alert_type_count: [],         // counts aligned with labels
                    distribution: [],             // [{ alert_type_id, alert_type, count }]
                });
            }

            const typeIds = types.map(t => t.id);

            // 2) Group Alerts by emergency_type_id for this org
            const grouped = await prisma.alerts.groupBy({
                by: ["emergency_type_id"],
                where: {
                    organization_id,
                    emergency_type_id: { in: typeIds },
                },
                _count: { _all: true },
            });

            // 3) Build a map for quick lookup
            const countMap = new Map(grouped.map(g => [g.emergency_type_id, g._count._all]));

            // 4) Materialize full distribution (including zero-count types)
            const distribution = types.map(t => ({
                alert_type_id: t.id,
                alert_type: t.name,
                count: countMap.get(t.id) ?? 0,
            }));

            // Optional: sort by count desc for nicer charts
            distribution.sort((a, b) => b.count - a.count);



            return res.status(200).json({
                organization_id,
                distribution,       // detailed objects
            });
        } catch (error) {
            logger.error("getAlertDistribution error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getResponseTimeTrend: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // 1️⃣ Fetch all sites of the organization
            const sites = await prisma.sites.findMany({
                where: { organization_id },
                select: { id: true, name: true },
            });

            if (sites.length === 0) {
                return res.status(200).json({
                    organization_id,
                    unit: "minutes",
                    data: [],
                });
            }

            const siteIds = sites.map((s) => s.id);

            // 2️⃣ Get all alert-site links
            const alertLinks = await prisma.alert_Sites.findMany({
                where: { site_id: { in: siteIds } },
                select: { site_id: true, alert_id: true },
            });

            // Build map: site_id -> alert_ids[]
            const siteToAlertIds = new Map();
            for (const { site_id, alert_id } of alertLinks) {
                if (!siteToAlertIds.has(site_id)) siteToAlertIds.set(site_id, new Set());
                siteToAlertIds.get(site_id).add(alert_id);
            }

            const allAlertIds = [...new Set(alertLinks.map((a) => a.alert_id))];

            if (allAlertIds.length === 0) {
                return res.status(200).json({
                    organization_id,
                    unit: "minutes",
                    data: sites.map((s) => ({
                        site_name: s.name,
                        average_response_time: null,
                    })),
                });
            }

            // 3️⃣ Fetch acknowledged recipients for those alerts
            const recipients = await prisma.notification_Recipients.findMany({
                where: {
                    alert_id: { in: allAlertIds },
                    acknowledged_at: { not: null },
                    alert: { organization_id },
                },
                select: {
                    alert_id: true,
                    created_at: true,
                    acknowledged_at: true,
                },
            });

            // 4️⃣ Build alert_id -> response times (ms)
            const alertToDurations = new Map();
            for (const r of recipients) {
                const diffMs =
                    new Date(r.acknowledged_at).getTime() -
                    new Date(r.created_at).getTime();
                if (diffMs < 0 || Number.isNaN(diffMs)) continue;
                if (!alertToDurations.has(r.alert_id))
                    alertToDurations.set(r.alert_id, []);
                alertToDurations.get(r.alert_id).push(diffMs);
            }

            // 5️⃣ Compute average per site
            const data = sites.map((site) => {
                const alertIds = siteToAlertIds.get(site.id)
                    ? [...siteToAlertIds.get(site.id)]
                    : [];
                let totalMs = 0;
                let count = 0;

                for (const aid of alertIds) {
                    const times = alertToDurations.get(aid);
                    if (!times) continue;
                    for (const t of times) {
                        totalMs += t;
                        count++;
                    }
                }

                const avgMinutes =
                    count > 0 ? Number((totalMs / count / (1000 * 60)).toFixed(2)) : null;

                return {
                    site_name: site.name,
                    average_response_time: avgMinutes,
                };
            });

            return res.status(200).json({
                organization_id,
                unit: "minutes",
                data,
            });
        } catch (error) {
            logger.error("getResponseTimeTrend error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getGeneralSettings: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            const org = await prisma.organizations.findUnique({
                where: { organization_id },
                select: {
                    name: true,
                    time_zone: true,
                    main_contact_name: true,
                    main_contact_email: true,
                    main_contact_phone: true,
                    industry_type: { select: { name: true } },
                },
            });

            if (!org) {
                return res.status(404).json({ success: false, message: "Organization not found" });
            }

            // Pick a primary site as org address (oldest created)
            const primarySite = await prisma.sites.findFirst({
                where: { organization_id },
                orderBy: { created_at: "asc" },
                select: {
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                },
            });

            const street = primarySite
                ? [primarySite.address_line_1, primarySite.address_line_2].filter(Boolean).join(", ")
                : "";

            return res.status(200).json({
                success: true,
                data: {
                    company_name: org.name,
                    industry_type_name: org.industry_type?.name ?? "",
                    primary_contact_name: org.main_contact_name ?? "",
                    contact_email: org.main_contact_email ?? "",
                    contact_phone: org.main_contact_phone ?? "",
                    time_zone: org.time_zone,
                    organization_address: {
                        street_address: street,
                        state: primarySite?.state ?? "",
                        city: primarySite?.city ?? "",
                        zip: primarySite?.zip_code ?? "",
                        country: "", // not in schema
                    },
                },
            });
        } catch (error) {
            logger.error("getGeneralSettings error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },
    updateGeneralSettings: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            const {
                company_name,
                time_zone,
                primary_contact_name,
                contact_email,
                contact_phone,
                industry_type_id,
                organization_address,
            } = req.body;

            // 1) Update Organizations table
            await prisma.organizations.update({
                where: { organization_id },
                data: {
                    ...(company_name !== undefined ? { name: company_name } : {}),
                    ...(time_zone !== undefined ? { time_zone } : {}),
                    ...(primary_contact_name !== undefined ? { main_contact_name: primary_contact_name } : {}),
                    ...(contact_email !== undefined ? { main_contact_email: contact_email } : {}),
                    ...(contact_phone !== undefined ? { main_contact_phone: contact_phone } : {}),
                    ...(industry_type_id !== undefined ? { industry_type_id } : {}),
                },
            });

            // 2) Update primary site's address (oldest created site)
            if (organization_address && typeof organization_address === "object") {
                const primarySite = await prisma.sites.findFirst({
                    where: { organization_id },
                    orderBy: { created_at: "asc" },
                    select: { id: true },
                });

                if (primarySite) {
                    await prisma.sites.update({
                        where: { id: primarySite.id },
                        data: {
                            ...(organization_address.street_address_line_1 !== undefined
                                ? { address_line_1: organization_address.street_address_line_1 }
                                : {}),
                            ...(organization_address.street_address_line_2 !== undefined
                                ? { address_line_2: organization_address.street_address_line_2 }
                                : {}),
                            ...(organization_address.city !== undefined ? { city: organization_address.city } : {}),
                            ...(organization_address.state !== undefined ? { state: organization_address.state } : {}),
                            ...(organization_address.zip !== undefined ? { zip_code: organization_address.zip } : {}),
                        },
                    });
                }
            }

            return res.status(200).json({
                success: true,
                message: "General settings updated successfully",
            });
        } catch (error) {
            logger.error("updateGeneralSettings error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },
    getBillingHistory: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;

            if (!organization_id) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const rows = await prisma.subscriptions.findMany({
                where: { organization_id },
                orderBy: { created_at: "desc" },
                select: {
                    id: true,
                    status: true,
                    payment_status: true,
                    payment_method: true,
                    current_period_start: true,
                    current_period_end: true,
                    auto_renew: true,
                    created_at: true,

                    stripe_customer_id: true,
                    stripe_subscription_id: true,
                    stripe_price_id: true,

                    plan: {
                        select: {
                            id: true,
                            plan_name: true,
                            monthly_price: true,
                            annual_price: true,
                            stripe_price_id: true,
                        },
                    },
                },
            });

            // derive billing_cycle + amount from plan + period length
            const data = rows.map((s) => {
                const start = s.current_period_start ? new Date(s.current_period_start) : null;
                const end = s.current_period_end ? new Date(s.current_period_end) : null;

                let billing_cycle = "";
                if (start && end) {
                    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
                    // rough heuristic
                    billing_cycle = days >= 330 ? "yearly" : "monthly";
                }

                const amount =
                    billing_cycle === "yearly"
                        ? (s.plan?.annual_price ?? null)
                        : (s.plan?.monthly_price ?? null);

                return {
                    subscription_id: s.id,
                    plan_id: s.plan?.id ?? null,
                    plan_name: s.plan?.plan_name ?? "",
                    billing_cycle,
                    amount, // Decimal (Prisma Decimal) – return as-is or stringify if needed
                    status: s.status,
                    payment_status: s.payment_status,
                    payment_method: s.payment_method ?? "",
                    period_start: s.current_period_start,
                    period_end: s.current_period_end,
                    auto_renew: s.auto_renew,
                    billed_at: s.created_at,
                    stripe: {
                        stripe_customer_id: s.stripe_customer_id,
                        stripe_subscription_id: s.stripe_subscription_id,
                        stripe_price_id: s.stripe_price_id,
                    },
                };
            });

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            logger.error("getBillingHistory error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },
    getIndividualAlertDetails: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id;
            const alert_id = alertIdParamSchema.parse(req.params.alertId);

            if (!organization_id) {
                getOrganizationIdOrUnauthorized(req, res);
                return;
            }

            // ----------------------------
            // Fetch alert (must belong to org) + org name + created_by + targeted sites
            // ----------------------------
            const alert = await prisma.alerts.findFirst({
                where: { id: alert_id, organization_id },
                select: {
                    id: true,
                    status: true,
                    message: true,
                    action_required: true, // ✅ description source
                    severity: true,
                    response_required: true,
                    start_time: true,
                    scheduled_time: true,
                    end_time: true, // ✅ end_date_time
                    created_at: true,

                    emergency_type: { select: { name: true } }, // ✅ alert_type
                    organization: { select: { name: true } }, // ✅ organization_name

                    user: {
                        // ✅ created_by (user)
                        select: {
                            user_id: true,
                            first_name: true,
                            last_name: true,
                        },
                    },

                    Alert_Sites: {
                        // ✅ site name(s) targeted by alert
                        select: {
                            site: { select: { id: true, name: true } },
                        },
                    },

                    // If you also want area targeting names, uncomment:
                    // Alert_Areas: {
                    //   select: { area: { select: { id: true, name: true } } },
                    // },
                },
            });

            if (!alert) {
                return res.status(404).json({ message: "Alert not found for this organization." });
            }

            // ----------------------------
            // Fetch recipients + user details + contractor company (if any)
            // ----------------------------
            const recipients = await prisma.notification_Recipients.findMany({
                where: { alert_id },
                select: {
                    user_id: true,
                    delivery_status: true,
                    delivered_at: true,
                    acknowledged_at: true,
                    response: true,
                    response_updated_at: true,
                    user: {
                        select: {
                            user_id: true,
                            first_name: true,
                            last_name: true,
                            user_type: true,
                            area: { select: { id: true, name: true } },
                            site: { select: { id: true, name: true } },

                            // ✅ if user_type=contractor
                            contractors: {
                                select: {
                                    contracting_company: {
                                        select: { id: true, name: true },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { created_at: "asc" },
            });

            // ----------------------------
            // Latest location per user for this alert
            // (Postgres: distinct on user_id)
            // ----------------------------
            const latestLocations = await prisma.user_Locations.findMany({
                where: { alert_id },
                orderBy: { timestamp: "desc" },
                distinct: ["user_id"],
                select: {
                    user_id: true,
                    latitude: true,
                    longitude: true,
                    location_name: true,
                    timestamp: true,
                },
            });

            const users = buildRecipientUsers(recipients, latestLocations);
            const {
                total_employees_count,
                safe_count,
                need_help_count,
                emergency_help_needed_count,
                not_responded_count,
            } = summarizeRecipientResponses(users);
            const { startDt, endDt, elapsed_time, sites, created_by } =
                buildAlertDetailComputedFields(alert);

            // ----------------------------
            // Response
            // ----------------------------
            return res.status(200).json({
                alert_id: alert.id,

                // existing fields
                alert_time: (alert.start_time ?? alert.created_at)?.toISOString?.() ?? null,
                alert_date: alert.start_time
                    ? new Date(alert.start_time).toISOString().slice(0, 10)
                    : new Date(alert.created_at).toISOString().slice(0, 10),

                alert_status: alert.status,


                // ✅ requested fields
                alert_type: alert.emergency_type?.name ?? null,
                description: alert.message ?? null,


                sites, // detailed array [{site_id, site_name}]

                start_date_time: startDt?.toISOString?.() ?? null,
                end_date_time: endDt?.toISOString?.() ?? null,
                elapsed_time, // seconds


                severity_level: alert.severity ?? null,

                organization_id,
                organization_name: alert.organization?.name ?? null,

                created_by,

                // counts
                total_employees_count,
                safe_count,
                need_help_count,
                emergency_help_needed_count,
                not_responded_count,

                users,
            });
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({
                    message: "Invalid alertId param",
                    error: error.errors,
                });
            }

            logger.error("getIndividualAlertDetails error:", { error });

            return res.status(500).json({
                message: "Server error",
                error: error?.message ?? "Unknown error",
            });
        }
    },
    createAlert: async (req, res) => {
        try {
            const organization_id = getOrganizationIdOrUnauthorized(req, res);
            if (!organization_id) return;

            const user_id = req.user?.user_id;
            if (!user_id) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const validation = createAlertSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: "Invalid input",
                    errors: validation.error.flatten(),
                });
            }

            const {
                alert_type,
                severity_level,
                alert_message,
                send_sms,
                response_required,
                timing_details,
                selected_area_details,
            } = validation.data;

            const { newAlert } = await createAlertForOrganization(
                prisma,
                notificationQueue,
                {
                    user_id,
                    organization_id,
                    alert_type,
                    severity_level,
                    alert_message,
                    send_sms,
                    response_required,
                    timing_details,
                    selected_area_details,
                },
            );

            return res.status(201).json({
                message: `Alert has been successfully ${newAlert.status === AlertStatus.active ? "queued for dispatch" : "scheduled"
                    }.`,
                alert_id: newAlert.id,
                status: newAlert.status,
            });
        } catch (error) {
            if (respondWithKnownServiceError(res, error, [400, 403, 404], {
                400: (err) => ({
                    ...(err.invalid_area_ids ? { invalid_area_ids: err.invalid_area_ids } : {}),
                    ...(err.invalid_site_ids ? { invalid_site_ids: err.invalid_site_ids } : {}),
                }),
            })) return;

            logger.error("createAlert error:", { error });
            return res.status(500).json({
                message: "Server error",
                error: error.message,
            });
        }
    },
    getAlertDashboard: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const { filter } = req.query;
            const page = parseInt(req.query.page) || 1;
            const limit = 5;

            const payload = await getAlertDashboardPayload(prisma, {
                organization_id: organizationId,
                filter,
                page,
                limit,
            });
            res.json(payload);
        } catch (error) {
            logger.error("Error fetching alert dashboard:", { error });
            res.status(500).json({ error: "Error fetching alert dashboard" });
        }
    },
    resolveAlert: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const alert_id = req.params?.alertId || req.body?.alert_id;
            const { message } = req.body;

            const resolvedByUserId = req.user?.user_id;

            await resolveAlertForOrganization(prisma, {
                organization_id: organizationId,
                alert_id,
                message,
                resolvedByUserId,
            });

            return res.status(200).json({
                success: true,
                message: "Alert resolved successfully.",
            });
        } catch (error) {
            if (respondWithKnownServiceError(res, error, [400, 403, 404, 409])) return;

            logger.error("resolveAlert error:", { error });
            return res.status(500).json({
                message: "Server error",
                error: error.message,
            });
        }
    },
    getAlertTypes: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const alert_types = await getAlertTypesForOrganization(prisma, organizationId);
            return res.json({ alert_types });
        } catch (err) {
            logger.error("getAlertTypes error:", { error: err });
            return res.status(500).json({ message: "Something went wrong" });
        }
    },
    getSites: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const sites = await getSitesForOrganization(prisma, organizationId);
            return res.json({ sites });
        } catch (err) {
            logger.error("getSites error:", { error: err });
            return res.status(500).json({ message: "Something went wrong" });
        }
    },
    getAreas: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const { site_id } = req.query;

            const areas = await getAreasForOrganizationSite(
                prisma,
                organizationId,
                site_id,
            );
            return res.json({ areas });
        } catch (err) {
            if (respondWithKnownServiceError(res, err, [401])) return;
            logger.error("getAreas error:", { error: err });
            return res.status(500).json({ message: "Something went wrong" });
        }
    },
    getAreas: async (req, res) => {
        try {
            const organizationId = getOrganizationIdOrUnauthorized(req, res);
            if (!organizationId) return;

            const { site_id } = req.query;

            const areas = await getAreasForOrganizationSite(
                prisma,
                organizationId,
                site_id,
            );
            return res.json({ areas });
        } catch (err) {
            if (respondWithKnownServiceError(res, err, [401])) return;
            logger.error("getAreas error:", { error: err });
            return res.status(500).json({ message: "Something went wrong" });
        }
    },
}


export default AdminController;

