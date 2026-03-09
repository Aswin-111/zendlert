// controllers/employee.controller.js
import loginSchema from "../validators/organization/login.validator.js";
import bcrypt from "bcrypt";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";

import {
  recordEmployeeAlertResponseWithLocation,
  ALLOWED_RESPONSES,
} from "../services/employeeAlertResponse.service.js";
import {
  buildRespondToAlertSchema,
  listLimitQuerySchema,
  reportVisitorSchema,
  toggleNotificationSchema,
  updateProfileBodySchema,
} from "../validators/employee/employee.validator.js";
import {
  buildAlertLocationsForAlerts,
  getAuthContext,
} from "../helpers/employee.helper.js";
import { generateTokens, sendRefreshTokenCookie } from "../utils/token.js";

const EmployeeController = {
  employeeLogin: async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((err) => err.message);
        return res.status(400).json({ message: "Invalid credentials", errors });
      }

      const { email, password } = parsed.data;

      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase() },
        include: { role: true, area: true, site: true },
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

      const { accessToken, refreshToken } = generateTokens(user);

      await prisma.users.update({
        where: { user_id: user.user_id },
        data: { refresh_token: refreshToken },
      });

      sendRefreshTokenCookie(res, refreshToken);

      logger.info(`Login success: ${email}`);
      return res.status(200).json({
        message: "Login successful",
        accessToken,
        refreshToken,
        user: {
          user_id: user.user_id,
          organization_id: user.organization_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role?.role_name || "user",
          area: {
            area_id: user.area_id,
            area_name: user?.area?.name,
          },
          site: {
            site_id: user.site_id,
            site_name: user?.site?.name,
          },
        },
      });
    } catch (error) {
      logger.error("Login error:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  },

  // NOTE: If auth middleware is used on this route, you can remove user_id from body.
  // Keeping it as you had (no behavior change) but still validates response enum.
  respondToAlert: async (req, res) => {
    try {
      const parsed = buildRespondToAlertSchema(ALLOWED_RESPONSES).parse(req.body);
      const result = await recordEmployeeAlertResponseWithLocation({
        alert_id: parsed.alert_id,
        user_id: parsed.user_id,
        response: parsed.response,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        location_name: parsed.location_name ?? null,
      });

      return res.status(200).json({
        message: "Response recorded successfully",
        recipient: result.recipient,
      });
    } catch (err) {
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: err.errors });
      }
      logger.error("respondToAlert error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },


  /**
   * 1) Get Response History (for the logged-in employee)
   * Output:
   * alert type, location, employee status, alert start datetime, employee respond time
   *
   * GET /employee/response-history?limit=20
   */
  getResponseHistory: async (req, res) => {
    try {
      const { user_id: userId } = getAuthContext(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { limit } = listLimitQuerySchema.parse(req.query);

      const rows = await prisma.notification_Recipients.findMany({
        where: {
          user_id: userId,
          response: { not: null },
        },
        orderBy: { response_updated_at: "desc" },
        take: limit,
        select: {
          response: true,
          response_updated_at: true,
          alert: {
            select: {
              id: true,
              start_time: true,
              created_at: true,
              emergency_type: { select: { name: true } },
            },
          },
        },
      });

      const alertIds = rows.map((r) => r.alert.id);
      const locationsMap = await buildAlertLocationsForAlerts(prisma, alertIds);

      const data = rows.map((r) => {
        const alert = r.alert;
        return {
          alert_type: alert.emergency_type?.name ?? "",
          location: (locationsMap.get(alert.id) ?? []).join(" | "),
          employee_status: r.response, // safe / need_help / emergency_help_needed
          alert_start_datetime: alert.start_time ?? alert.created_at,
          employee_respond_time: r.response_updated_at,
        };
      });

      return res.status(200).json({ data });
    } catch (err) {
      if (err?.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      logger.error("getResponseHistory error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  /**
   * 2) Organization info (organization_id from middleware injection)
   * Output:
   * site name , area name, site address, emergency contact name, emergency contact phone
   *
   * GET /employee/organization-info
   */
  
  getOrganizationInfo: async (req, res) => {
    try {
      const { user_id: userId, organization_id: organizationId } = getAuthContext(req);
      if (!organizationId)
        return res.status(401).json({ message: "Unauthorized" });

      // Organization info (from org_id)
      const org = await prisma.organizations.findUnique({
        where: { organization_id: organizationId },
        select: {
          organization_id: true,
          name: true,
          time_zone: true,
          main_contact_name: true,
          main_contact_phone: true,
        },
      });

      if (!org) return res.status(404).json({ error: "Organization not found" });

      // Employee's site/area (for site name/address, area name)
      let site = null;
      let area = null;

      if (userId) {
        const user = await prisma.users.findUnique({
          where: { user_id: userId },
          select: {
            site: {
              select: {
                id: true,
                name: true,
                address_line_1: true,
                address_line_2: true,
                city: true,
                state: true,
                zip_code: true,
                contact_name: true,
                contact_phone: true,
              },
            },
            area: { select: { id: true, name: true } },
          },
        });

        site = user?.site ?? null;
        area = user?.area ?? null;
      }

      const site_address = site
        ? [
          site.address_line_1,
          site.address_line_2,
          site.city,
          site.state,
          site.zip_code,
        ]
          .filter(Boolean)
          .join(", ")
        : "";

      // Emergency contact: prefer site contact if present, fallback to org main contact
      const emergency_contact_name =
        site?.contact_name || org.main_contact_name || "";
      const emergency_contact_phone =
        site?.contact_phone || org.main_contact_phone || "";

      return res.status(200).json({
        data: {
          organization: {
            organization_id: org.organization_id,
            name: org.name ?? "",
            time_zone: org.time_zone ?? "",
          },
          site: {
            site_id: site?.id ?? null,
            site_name: site?.name ?? "",
            site_address,
          },
          area: {
            area_id: area?.id ?? null,
            area_name: area?.name ?? "",
          },
          emergency_contact: {
            name: emergency_contact_name,
            phone: emergency_contact_phone,
          },
        },
      });
    } catch (err) {
      logger.error("getOrganizationInfo error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  /**
   * 3) Recent Notifications (received by the employee)
   * Output:
   * alert type, date, time, active or resolved
   *
   * GET /employee/recent-notifications?limit=20
   */
  getRecentNotifications: async (req, res) => {
    try {
      const { user_id: userId } = getAuthContext(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { limit } = listLimitQuerySchema.parse(req.query);

      const rows = await prisma.notification_Recipients.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          created_at: true,
          alert: {
            select: {
              status: true,
              emergency_type: { select: { name: true } },
            },
          },
        },
      });

      const data = rows.map((r) => {
        const alert = r.alert;

        const dt = r.created_at; // best proxy for "received time" in your schema
        const iso = new Date(dt).toISOString();
        const date = iso.slice(0, 10);
        const time = iso.slice(11, 19);

        const status = String(alert.status ?? "");
        const active_or_resolved =
          status === "active"
            ? "active"
            : ["resolved", "ended", "cancelled"].includes(status)
              ? "resolved"
              : status;

        return {
          alert_type: alert.emergency_type?.name ?? "",
          date,
          time,
          status: active_or_resolved,
        };
      });

      return res.status(200).json({ data });
    } catch (err) {
      if (err?.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      logger.error("getRecentNotifications error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getProfile: async (req, res) => {
    try {
      const { user_id: userId, organization_id: organizationId } = req.user;

      if (!userId || !organizationId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await prisma.users.findFirst({
        where: {
          user_id: userId,
          organization_id: organizationId,
          is_active: true,
          employee: { isNot: null }, // ensure employee
        },
        select: {
          user_id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          site: {
            select: {
              id: true,
              name: true,
            },
          },
          area: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: "Employee not found" });
      }

      return res.status(200).json({
        success: true,
        data: {
          user_id: user.user_id,
          full_name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone: user.phone_number,
          site: user.site?.name ?? null,
          area: user.area?.name ?? null,
        },
      });
    } catch (error) {
      logger.error("getProfile error:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { user_id: userId, organization_id: organizationId } = req.user;
      const parsedBody = updateProfileBodySchema.safeParse(req.body ?? {});

      if (!userId || !organizationId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!parsedBody.success) {
        return res.status(400).json({
          message: "At least one field is required to update",
        });
      }
      const { full_name, email, phone } = parsedBody.data;

      let first_name, last_name;
      if (full_name) {
        const parts = full_name.trim().split(" ");
        first_name = parts.shift();
        last_name = parts.join(" ") || "";
      }

      // Ensure employee exists & belongs to org
      const existingUser = await prisma.users.findFirst({
        where: {
          user_id: userId,
          organization_id: organizationId,
          employee: { isNot: null },
        },
      });

      if (!existingUser) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Email uniqueness check (if email is changing)
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.users.findUnique({
          where: { email },
        });

        if (emailExists) {
          return res.status(409).json({
            message: "Email already in use",
          });
        }
      }

      const updatedUser = await prisma.users.update({
        where: { user_id: userId },
        data: {
          ...(first_name && { first_name }),
          ...(last_name !== undefined && { last_name }),
          ...(email && { email }),
          ...(phone && { phone_number: phone }),
        },
        select: {
          user_id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user_id: updatedUser.user_id,
          full_name: `${updatedUser.first_name} ${updatedUser.last_name}`,
          email: updatedUser.email,
          phone: updatedUser.phone_number,
        },
      });
    } catch (error) {
      logger.error("updateProfile error:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
  reportVisitor: async (req, res) => {
    try {
      const { user_id: userId, organization_id: organizationId } = getAuthContext(req);
      if (!userId || !organizationId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const parsed = reportVisitorSchema.parse(req.body);

      // Ensure alert belongs to same org
      const alert = await prisma.alerts.findFirst({
        where: { id: parsed.alert_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!alert) {
        return res.status(404).json({ message: "Alert not found for this organization" });
      }

      // (Optional) Ensure reporter user exists + active in org
      const reporter = await prisma.users.findFirst({
        where: { user_id: userId, organization_id: organizationId, is_active: true },
        select: { user_id: true },
      });
      if (!reporter) {
        return res.status(404).json({ message: "Reporting user not found" });
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1) Upsert company by name (you have Companies.name but not unique in schema)
        // Recommended: add @@unique([name]) OR @@unique([name, ...]) for proper upsert.
        // Since your schema shows `name String` (not unique), we'll do findFirst + create.
        let company = await tx.companies.findFirst({
          where: { name: parsed.company_name },
          select: { id: true, name: true },
        });

        if (!company) {
          company = await tx.companies.create({
            data: { name: parsed.company_name },
            select: { id: true, name: true },
          });
        }

        // 2) Create visitor
        const visitor = await tx.visitors.create({
          data: {
            organization_id: organizationId,
            first_name: parsed.first_name,
            last_name: parsed.last_name || null,
            phone: parsed.contact_number || null,
            company_id: company.id,
            is_active: true,
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            phone: true,
            company: { select: { id: true, name: true } },
            created_at: true,
          },
        });

        // 3) Create visitor status (linked to alert + reported_by user)
        const status = await tx.visitor_Status.create({
          data: {
            alert_id: parsed.alert_id,
            reported_by_user_id: userId,
            visitor_id: visitor.id,
            status: "reported", // your Visitor_Status.status is String; you can standardize values
            location: parsed.location,
            notes: parsed.visiting_purpose,
          },
          select: {
            id: true,
            alert_id: true,
            reported_by_user_id: true,
            visitor_id: true,
            status: true,
            location: true,
            notes: true,
            reported_at: true,
          },
        });

        return { visitor, status };
      });

      return res.status(201).json({
        success: true,
        message: "Visitor reported successfully",
        data: result,
      });
    } catch (err) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: err.errors });
      }
      logger.error("reportVisitor error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
  toggleEmergencyNotification: async (req, res) => {
    try {
      const { user_id: userId, organization_id: organizationId } = getAuthContext(req);
      if (!userId || !organizationId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { enabled } = toggleNotificationSchema.parse(req.body ?? {});

      // Ensure user exists + belongs to org + active
      const user = await prisma.users.findFirst({
        where: { user_id: userId, organization_id: organizationId, is_active: true },
        select: { user_id: true, send_emergency_notification: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const nextValue =
        typeof enabled === "boolean"
          ? enabled
          : !user.send_emergency_notification;

      const updated = await prisma.users.update({
        where: { user_id: userId },
        data: { send_emergency_notification: nextValue },
        select: {
          user_id: true,
          send_emergency_notification: true,
          updated_at: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Notification preference updated",
        data: {
          user_id: updated.user_id,
          send_emergency_notification: updated.send_emergency_notification,
          updated_at: updated.updated_at,
        },
      });
    } catch (err) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: err.errors });
      }
      logger.error("toggleEmergencyNotification error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

};

export default EmployeeController;
