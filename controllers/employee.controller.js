// controllers/employee.controller.js
import loginSchema from "../validators/organization/login.validator.js";
import { PrismaClient } from "@prisma/client";
import z from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

import {
  recordEmployeeAlertResponse,
  ALLOWED_RESPONSES,
} from "../services/employeeAlertResponse.service.js";

const prisma = new PrismaClient();

// Reads ids injected by verifyJWT
function getAuthContext(req) {
  const u = req.user || {};
  return {
    user_id: u.user_id || u.id || u.userId,
    organization_id: u.organization_id || u.organizationId,
  };
}

async function buildAlertLocationsForAlerts(alertIds) {
  if (!alertIds?.length) return new Map();

  const [alertSites, alertAreas] = await Promise.all([
    prisma.alert_Sites.findMany({
      where: { alert_id: { in: alertIds } },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address_line_1: true,
            address_line_2: true,
            city: true,
            state: true,
            zip_code: true,
          },
        },
      },
    }),
    prisma.alert_Areas.findMany({
      where: { alert_id: { in: alertIds } },
      include: { area: { select: { name: true, site_id: true } } },
    }),
  ]);

  const siteIdsFromAreas = Array.from(
    new Set(alertAreas.map((x) => x.area?.site_id).filter(Boolean))
  );

  const sitesForAreas = siteIdsFromAreas.length
    ? await prisma.sites.findMany({
      where: { id: { in: siteIdsFromAreas } },
      select: { id: true, name: true },
    })
    : [];

  const siteNameById = new Map(sitesForAreas.map((s) => [s.id, s.name]));

  const map = new Map();
  for (const id of alertIds) map.set(id, []);

  for (const row of alertSites) {
    const arr = map.get(row.alert_id);
    if (!arr) continue;

    const s = row.site;
    if (!s?.name) continue;

    const addr = [
      s.address_line_1,
      s.address_line_2,
      s.city,
      s.state,
      s.zip_code,
    ]
      .filter(Boolean)
      .join(", ");

    arr.push(addr ? `${s.name} (${addr})` : s.name);
  }

  for (const row of alertAreas) {
    const arr = map.get(row.alert_id);
    if (!arr) continue;

    const a = row.area;
    if (!a?.name) continue;

    const siteName = siteNameById.get(a.site_id);
    arr.push(siteName ? `${siteName} — ${a.name}` : a.name);
  }

  return map;
}

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

  // NOTE: If verifyJWT is used on this route, you can remove user_id from body.
  // Keeping it as you had (no behavior change) but still validates response enum.
  respondToAlert: async (req, res) => {
    try {
      const RespondToAlertSchema = z.object({
        alert_id: z.string().uuid("alert_id must be a valid UUID"),
        user_id: z.string().uuid("user_id must be a valid UUID"),
        response: z.enum(ALLOWED_RESPONSES),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
        location_name: z.string().trim().max(255).optional(),
      });

      const parsed = RespondToAlertSchema.parse(req.body);

      const result = await recordEmployeeAlertResponse(parsed);

      return res.status(200).json({
        message: "Response recorded successfully",
        recipient: result,
      });
    } catch (err) {
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.name === "ZodError") {
        return res.status(400).json({ error: err.errors });
      }
      console.error("respondToAlert error:", err);
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
      const { user_id } = getAuthContext(req);
      if (!user_id) return res.status(401).json({ message: "Unauthorized" });

      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      });
      const { limit } = schema.parse(req.query);

      const rows = await prisma.notification_Recipients.findMany({
        where: {
          user_id,
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
      const locationsMap = await buildAlertLocationsForAlerts(alertIds);

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
      console.error("getResponseHistory error:", err);
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
      const { user_id, organization_id } = getAuthContext(req);
      if (!organization_id)
        return res.status(401).json({ message: "Unauthorized" });

      // Organization info (from org_id)
      const org = await prisma.organizations.findUnique({
        where: { organization_id },
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

      if (user_id) {
        const user = await prisma.users.findUnique({
          where: { user_id },
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
      console.error("getOrganizationInfo error:", err);
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
      const { user_id } = getAuthContext(req);
      if (!user_id) return res.status(401).json({ message: "Unauthorized" });

      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      });
      const { limit } = schema.parse(req.query);

      const rows = await prisma.notification_Recipients.findMany({
        where: { user_id },
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
      console.error("getRecentNotifications error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getProfile: async (req, res) => {
    try {
      const { user_id, organization_id } = req.user;

      if (!user_id || !organization_id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await prisma.users.findFirst({
        where: {
          user_id,
          organization_id,
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
      const { user_id, organization_id } = req.user;

      if (!user_id || !organization_id) {
        return res.status(400).json({ success: false, message: "Invalid token payload" });
      }

      // Ensure employee exists in this org (optional but recommended)
      const employee = await prisma.employees.findFirst({
        where: { user_id, organization_id },
        select: { id: true, user_id: true },
      });

      if (!employee) {
        return res.status(404).json({ success: false, message: "Employee profile not found" });
      }

      const first_name = cleanStr(req.body.first_name);
      const last_name = cleanStr(req.body.last_name);
      const email = cleanStr(req.body.email);
      const phone = cleanStr(req.body.phone);

      // Require at least one field
      if (!first_name && !last_name && !email && !phone) {
        return res.status(400).json({
          success: false,
          message: "Provide at least one field to update",
        });
      }

      // Validate email if present
      if (email && !isEmail(email)) {
        return res.status(400).json({ success: false, message: "Invalid email" });
      }

      // Validate phone if present (basic; adjust for your needs)
      if (phone && phone.length < 8) {
        return res.status(400).json({ success: false, message: "Invalid phone" });
      }

      // If email is changing, enforce uniqueness (optional but recommended)
      if (email) {
        const existing = await prisma.users.findFirst({
          where: {
            email,
            NOT: { id: user_id }, // adjust if your PK is not id
          },
          select: { id: true },
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            message: "Email already in use",
          });
        }
      }

      // Build update payload only with provided fields
      const userUpdate = {};
      if (first_name) userUpdate.first_name = first_name;
      if (last_name) userUpdate.last_name = last_name;
      if (email) userUpdate.email = email;
      if (phone) userUpdate.phone = phone;

      // Update user table (name/email/phone should live in users table)
      const updatedUser = await prisma.users.update({
        where: { id: user_id }, // adjust if your PK is user_id
        data: userUpdate,
        select: {
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          full_name: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
          email: updatedUser.email,
          phone: updatedUser.phone,
        },
      });
    } catch (err) {
      console.error("updateProfile error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
  updateProfile: async (req, res) => {
    try {
      const { user_id, organization_id } = req.user;
      const { full_name, email, phone } = req.body;

      if (!user_id || !organization_id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!full_name && !email && !phone) {
        return res.status(400).json({
          message: "At least one field is required to update",
        });
      }

      let first_name, last_name;
      if (full_name) {
        const parts = full_name.trim().split(" ");
        first_name = parts.shift();
        last_name = parts.join(" ") || "";
      }

      // Ensure employee exists & belongs to org
      const existingUser = await prisma.users.findFirst({
        where: {
          user_id,
          organization_id,
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
        where: { user_id },
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

};

export default EmployeeController;
