import { UserTypes } from "@prisma/client";
import { Resend } from "resend";
import bcrypt from "bcrypt";
import createOrganizationSchema from "../validators/organization/create-org.validator.js";
import createSiteSchema from "../validators/organization/create-site.validator.js";
import createAreaSchema from "../validators/organization/create-area.validator.js";
import createEmployeeSchema from "../validators/organization/create-employee.validator.js";

import redisClient from "../utils/redis.client.js"; // Redis
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
const resend = new Resend(process.env.RESEND_KEY);
import jwt from "jsonwebtoken";
import { generateTokens, sendRefreshTokenCookie } from "../utils/token.js";
import updateUserProfileSchema from "../validators/organization/update-user.validator.js";
import updateSiteSchema from "../validators/organization/update-site.validator.js";
import updateAreaSchema from "../validators/organization/update-area.validator.js";
import assignSiteAndAreaSchema from "../validators/organization/assign-site-area.validator.js";
import checkEmployeeEmailDomainSchema from "../validators/organization/check-employee-email-domain.validator.js";
import { generateSixDigitOtp } from "../helpers/otp.helper.js";
import {
  otpEmailSchema,
  otpPurposeSchema,
  verifyEmployeeOtpRequiredSchema,
  verifyOtpRequiredSchema,
} from "../validators/organization/otp.validator.js";
import {
  getEmployeeVerificationOtpEmailTemplate,
  getOtpEmailTemplateByPurpose,
  splitFullName,
} from "../helpers/organization.helper.js";
import {
  findAreaByOrganization,
  findSiteByOrganization,
} from "../helpers/ownership.helper.js";
import {
  checkBusinessNameQuerySchema,
  getAllSitesQuerySchema,
  getOrganizationNameQuerySchema,
  updateOrganizationBodySchema,
} from "../validators/organization/organization-meta.validator.js";
import { parseCheckEmailDomainInput } from "../validators/organization/check-email-domain.validator.js";
import loginOtpSchema from "../validators/organization/login-otp.validator.js";

const OTP_EXPIRY_SECONDS = 600;
const OrganizationController = {
  checkBusinessName: async (req, res) => {
    try {
      const parsed = checkBusinessNameQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid business_name" });
      }
      const { business_name } = parsed.data;

      const existing = await prisma.organizations.findFirst({
        where: { name: business_name },
      });

      return res.status(200).json({
        success: true,
        exists: !!existing,
      });
    } catch (error) {
      logger.error("Error checking business name:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  },
  checkEmailDomain: async (req, res) => {
    try {
      const validated = parseCheckEmailDomainInput(req.body);
      if (!validated.success) {
        return res.status(400).json({
          success: false,
          message: validated.message,
        });
      }
      const { domain } = validated;

      // -------------------------
      // 2. Block public email providers
      // -------------------------
      const blockedDomains = [
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "protonmail.com",
        "icloud.com",
        "aol.com",
        "zoho.com",
        "gmx.com",
        "yandex.com",
        "rediffmail.com",
      ];

      if (blockedDomains.includes(domain)) {
        return res.status(400).json({
          success: false,
          message: "Please use your organization's business email domain.",
          blockedDomain: domain,
        });
      }

      // -------------------------
      // 3. Check if organization exists
      // -------------------------
      const org = await prisma.organizations.findUnique({
        where: { email_domain: domain },
      });

      if (!org) {
        return res.status(200).json({
          success: true,
          exists: false,
          message: "This domain is not registered with any organization.",
        });
      }

      return res.status(200).json({
        success: true,
        exists: true,
        organization: org.name,
        message: `Domain belongs to ${org.name}.`,
      });
    } catch (error) {
      logger.error("checkEmailDomain error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error. Please try again later.",
      });
    }
  },
  sendOtp: async (req, res) => {
    try {
      const { email, purpose } = req.body;

      const parsedEmail = otpEmailSchema.safeParse({ email });
      if (!parsedEmail.success) {
        return res
          .status(400)
          .json({ message: "Invalid or missing email address." });
      }

      const parsedPurpose = otpPurposeSchema.safeParse({ purpose });
      if (!parsedPurpose.success) {
        return res.status(400).json({
          message: "Invalid or missing OTP purpose",
        });
      }

      if (purpose === "LOGIN") {
        const user = await prisma.users.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) {
          return res.status(404).json({ message: "User not found." });
        }
      }

      const isDev = process.env.NODE_ENV !== "production";
      const otp = isDev ? process.env.DUMMY_OTP || "111111" : generateSixDigitOtp();
      const { subject, html } = getOtpEmailTemplateByPurpose(purpose, otp);

      if (process.env.NODE_ENV !== "production") {
        logger.info(`[DEV OTP] ${purpose} | ${email} | OTP generated`);
      }

      await redisClient.setEx(
        `otp:${purpose}:${email}`,
        OTP_EXPIRY_SECONDS,
        otp,
      );

      if (!isDev) {
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: [email],
          subject,
          html,
        });
      }

      return res.status(200).json({
        success: true,
        message:
          purpose === "LOGIN"
            ? "Login OTP sent successfully."
            : "Organization verification OTP sent.",
        dev_otp: isDev ? otp : null,
      });
    } catch (err) {
      logger.error("sendOtp error:", err);
      return res.status(500).json({
        message: "Server error",
        error: err.message,
      });
    }
  },
  verifyOtp: async (req, res) => {
    try {
      const { email, otp, purpose } = req.body;

      const parsedRequired = verifyOtpRequiredSchema.safeParse({
        email,
        otp,
        purpose,
      });
      if (!parsedRequired.success) {
        return res.status(400).json({
          message: "Email, OTP and purpose are required.",
        });
      }

      const parsedPurpose = otpPurposeSchema.safeParse({ purpose });
      if (!parsedPurpose.success) {
        return res.status(400).json({
          message: "Invalid OTP purpose.",
        });
      }

      const redisKey = `otp:${purpose}:${email}`;
      const storedOtp = await redisClient.get(redisKey);

      if (!storedOtp || storedOtp !== otp) {
        return res.status(401).json({
          verified: false,
          message: "Invalid or expired OTP.",
        });
      }

      await redisClient.del(redisKey);

      return res.status(200).json({
        verified: true,
        message: "OTP verified successfully.",
      });
    } catch (error) {
      logger.error("verifyOtp error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  },
  loginWithOtp: async (req, res) => {
    try {
      const parsed = loginOtpSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "Email and OTP are required.",
        });
      }
      const { email, otp } = parsed.data;

      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          role: true,
          organization: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!user) {
        // Fail fast if email is not registered
        return res.status(404).json({ message: "User not found" });
      }

      const redisKey = `otp:LOGIN:${email}`;
      const storedOtp = await redisClient.get(redisKey);

      if (!storedOtp || storedOtp !== otp) {
        return res.status(401).json({
          message: "Invalid or expired OTP.",
        });
      }

      await redisClient.del(redisKey);
      const { accessToken, refreshToken } = generateTokens(user);

      // Store Refresh Token in DB
      await prisma.users.update({
        where: { user_id: user.user_id },
        data: { refresh_token: refreshToken },
      });

      // Set Cookie
      sendRefreshTokenCookie(res, refreshToken);

      const deviceId = req.body.device_id ?? null;

      const [existingBackup, existingDevice] = await Promise.all([
        prisma.user_Key_Backups.findUnique({
          where: { user_id: user.user_id },
          select: { version: true },
        }),
        deviceId
          ? prisma.user_Devices.findFirst({
            where: {
              user_id: user.user_id,
              device_id: deviceId,
              is_active: true,
            },
            select: { id: true },
          })
          : Promise.resolve(null),
      ]);

      // Replace your existing return with this:
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          user_id: user.user_id,
          organization_id: user.organization_id,
          organization_name: user.organization?.name,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role?.role_name,
        },
        key_status: {
          has_backup: !!existingBackup,
          device_registered: !!existingDevice,
          // Flutter reads this and branches:
          // has_backup=false               → generate keys, call UploadKeyBackup
          // has_backup=true, registered=false → call RequestKeyTransfer, poll, then RegisterDevice
          // has_backup=true, registered=true  → keys already in secure storage, proceed
        },
      });
    } catch (error) {
      logger.error("loginWithOtp error:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
  createOrganization: async (req, res) => {
    try {
      const parsed = createOrganizationSchema.safeParse(req.body);

      if (!parsed.success) {
        const simplifiedErrors = parsed.error.errors.map((err) => err.message);
        return res.status(400).json({
          message: "Please provide valid data",
          errors: simplifiedErrors,
        });
      }

      const email_domain = parsed.data.email.split("@")[1].toLowerCase();

      const { email, full_name, organization_name } = parsed.data;
      const { firstName, lastName } = splitFullName(full_name);
      // Check if org already exists
      const existingOrg = await prisma.organizations.findFirst({
        where: {
          OR: [
            { name: organization_name },
            { email_domain: email_domain.toLowerCase() },
          ],
        },
      });

      if (existingOrg) {
        return res
          .status(400)
          .json({ message: "Organization already exists." });
      }
      const adminRole = await prisma.roles.findUnique({
        where: {
          role_name: "admin",
        },
      });

      if (!adminRole) {
        return res
          .status(500)
          .json({ message: "Admin role not found in database." });
      }
      // Create new organization
      const newOrg = await prisma.organizations.create({
        data: {
          name: organization_name,
          email_domain: email_domain.toLowerCase(),
          is_active: true,
          time_zone: parsed.data.time_zone ?? "UTC",
        },
      });

      // Create user
      const newUser = await prisma.users.create({
        data: {
          email: email.toLowerCase(),
          user_type: UserTypes.employee,
          first_name: firstName,
          last_name: lastName,
          phone_number: "",
          organization_id: newOrg.organization_id,
          role_id: adminRole.id,
        },
      });

      const { accessToken, refreshToken } = generateTokens({
        ...newUser,
        organization: { name: newOrg.name },
        role: adminRole, // Ensure this object has role_name
      });

      await prisma.users.update({
        where: { user_id: newUser.user_id },
        data: { refresh_token: refreshToken },
      });

      sendRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        message: "Organization created successfully",
        organization: newOrg,
        accessToken,
        refreshToken,
        user: {
          email: newUser.email,
          name: newUser.first_name,
          role: adminRole.role_name,
          user_id: newUser.user_id,
          organization_id: newUser.organization_id,
        },
      });
    } catch (error) {
      logger.error("createAccount error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  getOrganizationName: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        user_id: req.user?.user_id ?? req.query?.user_id,
      };
      const parsed = getOrganizationNameQuerySchema.safeParse(queryInput);
      if (!parsed.success) {
        return res.status(400).json({ message: "User ID is required." });
      }
      const { user_id } = parsed.data;

      const userWithOrg = await prisma.users.findUnique({
        where: { user_id },
        include: {
          organization: true, // includes related organization
        },
      });

      if (!userWithOrg || !userWithOrg.organization) {
        return res
          .status(404)
          .json({ message: "Organization not found for this user" });
      }

      const industryTypes = await prisma.industry_Types.findMany();

      return res.status(200).json({
        organization_name: userWithOrg.organization.name,
        industry_types: industryTypes,
      });
    } catch (error) {
      logger.error("getOrganizationName error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  updateOrganization: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        organization_id: req.user?.organization_id ?? req.body?.organization_id,
      };
      const parsed = updateOrganizationBodySchema.safeParse(bodyInput);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "Organization ID is required." });
      }

      const {
        name,
        industry_type_id,
        main_contact_name,
        main_contact_email,
        main_contact_phone,
        organization_id,
      } = parsed.data;

      // Build dynamic update payload
      const dataToUpdate = {};
      if (name) dataToUpdate.name = name;
      if (industry_type_id) dataToUpdate.industry_type_id = industry_type_id;
      if (main_contact_name) dataToUpdate.main_contact_name = main_contact_name;
      if (main_contact_email)
        dataToUpdate.main_contact_email = main_contact_email;
      if (main_contact_phone)
        dataToUpdate.main_contact_phone = main_contact_phone;

      if (Object.keys(dataToUpdate).length === 0) {
        return res
          .status(400)
          .json({ message: "Fields are not provided for update." });
      }

      const updatedOrg = await prisma.organizations.update({
        where: { organization_id },
        data: dataToUpdate,
      });

      return res.status(200).json({
        message: "Organization updated successfully",
        organization: updatedOrg,
      });
    } catch (error) {
      logger.error("updateOrganization error:", error);
      if (error.code === "P2002") {
        // Unique constraint error (e.g., duplicate name or email)
        return res.status(409).json({
          message: "Duplicate field value violates unique constraint.",
        });
      }
      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
  updateUserProfile: async (req, res) => {
    try {
      const { user_id } = req.user; // From auth middleware

      const parsed = updateUserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: parsed.error.errors.map((e) => e.message),
        });
      }

      const { first_name: firstName,
        last_name: lastName, phone_number, email } = parsed.data;

      // 1. Check email uniqueness if it is being changed
      if (email) {
        const existingUser = await prisma.users.findUnique({
          where: { email: email.toLowerCase() },
        });

        // If email exists AND it belongs to someone else
        if (existingUser && existingUser.user_id !== user_id) {
          return res
            .status(409)
            .json({ message: "Email is already in use by another account." });
        }
      }

      // 2. Perform Update
      const updatedUser = await prisma.users.update({
        where: { user_id },
        data: {
          first_name: firstName,
          last_name: lastName,
          phone_number,
          // Only update email if provided
          email: email ? email.toLowerCase() : undefined,
        },
        select: {
          user_id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          role: { select: { role_name: true } },
        },
      });

      return res.status(200).json({
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      logger.error("updateUserProfile error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  updateSite: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        site_id: req.params?.siteId ?? req.body?.site_id,
      };
      const parsed = updateSiteSchema.safeParse(bodyInput);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: parsed.error.errors.map((e) => e.message),
        });
      }

      const {
        site_id,
        name,
        address_line_1,
        address_line_2,
        city,
        state,
        zip_code,
        contact_name,
        contact_email,
        contact_phone,
      } = parsed.data;

      const { organization_id } = req.user;

      const existingSite = await findSiteByOrganization(
        prisma,
        site_id,
        organization_id,
      );

      if (!existingSite) {
        return res
          .status(404)
          .json({ message: "Site not found or access denied." });
      }

      // 2. Perform Update
      const updatedSite = await prisma.sites.update({
        where: { id: site_id },
        data: {
          name,
          address_line_1,
          address_line_2,
          city,
          state,
          zip_code,
          contact_name,
          contact_email,
          contact_phone,
        },
      });

      return res.status(200).json({
        message: "Site details updated successfully",
        site: updatedSite,
      });
    } catch (error) {
      logger.error("updateSite error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  createSite: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        organization_id: req.user?.organization_id ?? req.body?.organization_id,
      };
      const parsed = createSiteSchema.safeParse(bodyInput);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((err) => err.message);
        logger.warn("createSite validation failed", {
          meta: { errors_count: errors.length },
        });
        return res.status(400).json({ message: "Validation failed", errors });
      }

      const {
        name,
        address_line_1,
        address_line_2,
        city,
        state,
        zip_code,
        contact_email,
        contact_phone,
        contact_name,
        organization_id,
      } = parsed.data;
      const existingOrg = await prisma.organizations.findUnique({
        where: { organization_id },
      });

      if (!existingOrg) {
        return res.status(400).json({ message: "Invalid organization ID." });
      }

      // 1. Create site
      const newSite = await prisma.sites.create({
        data: {
          organization_id,
          name,
          address_line_1,
          address_line_2,
          city,
          state,
          zip_code,
          contact_name,
          contact_email,
          contact_phone,
        },
      });

      return res.status(200).json({
        message: "Site created and organization updated successfully",
        site: newSite,
      });
    } catch (error) {
      logger.error("createSite error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  updateArea: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        area_id: req.params?.areaId ?? req.body?.area_id,
      };
      const parsed = updateAreaSchema.safeParse(bodyInput);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: parsed.error.errors.map((e) => e.message),
        });
      }

      const { area_id, name, description } = parsed.data;
      const { organization_id } = req.user;

      const existingArea = await findAreaByOrganization(
        prisma,
        area_id,
        organization_id,
      );

      if (!existingArea) {
        return res
          .status(404)
          .json({ message: "Area not found or access denied." });
      }

      // 2. Perform Update
      const updatedArea = await prisma.areas.update({
        where: { id: area_id },
        data: {
          name,
          description,
        },
      });

      return res.status(200).json({
        message: "Area details updated successfully",
        area: updatedArea,
      });
    } catch (error) {
      logger.error("updateArea error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  getAllSites: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
      };
      const parsed = getAllSitesQuerySchema.safeParse(queryInput);
      if (!parsed.success) {
        return res.status(400).json({ message: "organization_id is required." });
      }

      const { organization_id, page, limit } = parsed.data;
      const query = {
        where: { organization_id },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
        },
      };

      if (typeof limit === "number") {
        query.take = limit;
        if (typeof page === "number") {
          query.skip = (page - 1) * limit;
        }
      }

      const sites = await prisma.sites.findMany(query);
      return res
        .status(200)
        .json({ message: "Sites fetched successfully", data: sites });
    } catch (error) {
      logger.error("getAllSites error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  createArea: async (req, res) => {
    try {
      const parsed = createAreaSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((e) => e.message);
        return res.status(400).json({ message: "Invalid input", errors });
      }

      const { site_id, name, description } = parsed.data;

      // Optional: check if site exists
      const site = await prisma.sites.findUnique({ where: { id: site_id } });
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }

      const newArea = await prisma.areas.create({
        data: {
          site_id,
          name,
          description,
        },
      });

      return res.status(200).json({ message: "Area created", area: newArea });
    } catch (error) {
      logger.error("createArea error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  // employee signup route
  checkEmailForEmployee: async (req, res) => {
    try {
      const { domain } = req.query;
      const parsed = checkEmployeeEmailDomainSchema.safeParse({ domain });
      if (!parsed.success) {
        const errors = parsed.error.errors.map((e) => e.message);
        return res.status(400).json({ message: "Invalid input", errors });
      }

      const email_domain = parsed.data.domain.toLowerCase();

      const existingOrg = await prisma.organizations.findFirst({
        where: { email_domain },
      });
      if (!existingOrg) {
        return res.status(200).json({
          exists: false,
          message: "Your email domain is not registered with any organization",
        });
      }
      return res.status(200).json({
        exists: true,
        organization_name: existingOrg.name,
        id: existingOrg.organization_id,
      });
    } catch (error) {
      logger.error("checkEmailDomain error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  sendOtpForEmployeeSignup: async (req, res) => {
    try {
      const { email } = req.body;

      const parsedEmail = otpEmailSchema.safeParse({ email });
      if (!parsedEmail.success) {
        return res
          .status(400)
          .json({ message: "Invalid or missing email address." });
      }

      const otp = generateSixDigitOtp();
      const { subject, html } = getEmployeeVerificationOtpEmailTemplate(otp);

      await redisClient.setEx(`otp:${email}`, OTP_EXPIRY_SECONDS, otp);

      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: [email],
        subject,
        html,
      });

      return res.status(200).json({
        exists: true,
        message: "OTP sent to admin email.",
      });
    } catch (err) {
      logger.error("sendOtp error:", err);
      return res.status(500).json({
        message: "Server error",
        error: err.message,
      });
    }
  },
  verifyOtpForEmployeeSignup: async (req, res) => {
    try {
      const { email, otp } = req.body;

      const parsedRequired = verifyEmployeeOtpRequiredSchema.safeParse({
        email,
        otp,
      });
      if (!parsedRequired.success) {
        return res.status(400).json({ message: "Email and OTP are required." });
      }

      const storedOtp = await redisClient.get(`otp:${email}`);

      if (storedOtp === otp) {
        await redisClient.del(`otp:${email}`);
        return res
          .status(200)
          .json({ verified: true, message: "OTP verified successfully." });
      } else {
        return res
          .status(401)
          .json({ verified: false, message: "Invalid or expired OTP." });
      }
    } catch (error) {
      logger.error(`verifyOtp error: ${error.message}`, { error });
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  },
  createEmployee: async (req, res) => {
    try {
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((e) => e.message);
        return res.status(400).json({ message: "Invalid input", errors });
      }

      const { full_name, email, phone, password, domain } = parsed.data;

      // 1. Check if a user with this email already exists
      const existingUser = await prisma.users.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return res
          .status(409)
          .json({ message: "User with this email already exists" });
      }

      // 2. Find the organization using the provided domain
      const existingOrg = await prisma.organizations.findUnique({
        where: { email_domain: domain },
      });

      // 3. Validate that the organization was found
      if (!existingOrg) {
        return res
          .status(404)
          .json({ message: `Organization with domain '${domain}' not found.` });
      }

      // Now we can safely get the organization_id
      const organization_id = existingOrg.organization_id;

      // 4. Find the 'employee' role
      const role = await prisma.roles.findUnique({
        where: { role_name: "employee" },
      });

      if (!role) {
        // This is an important check to prevent server errors if the role is missing
        logger.error("'employee' role not found in the database.");
        return res.status(500).json({
          message: "Server configuration error: Employee role not found.",
        });
      }

      // 5. Prepare user data
      const password_hash = await bcrypt.hash(password, 10);
      const { firstName, lastName } = splitFullName(full_name);

      // 6. Create the new user and associate them with the found organization
      const newUser = await prisma.users.create({
        data: {
          email: email.toLowerCase(),
          password_hash,
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          is_active: true,
          user_type: "employee", // Note: user_type is an enum, so direct string is fine
          role_id: role.id,
          organization_id: organization_id, // Use the organization_id found via domain
        },
      });

      const { accessToken, refreshToken } = generateTokens({
        ...newUser,
        role: { role_name: role.role_name },
        organization: { name: existingOrg.name },
      });

      // Save Refresh Token to DB
      await prisma.users.update({
        where: { user_id: newUser.user_id },
        data: { refresh_token: refreshToken },
      });

      // Send HttpOnly Cookie
      sendRefreshTokenCookie(res, refreshToken);

      return res.status(201).json({
        message: `Employee joined under '${existingOrg.name}' successfully`,
        organization_id: organization_id,
        accessToken,
        refreshToken,
        user: {
          role: role.role_name,
          user_id: newUser.user_id,
          email: newUser.email,
          full_name: full_name,
        },
      });
    } catch (error) {
      logger.error("createEmployee error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  // employee login

  getSitesAndAreasByOrganizationId: async (req, res) => {
    const organization_id = req.user?.organization_id ?? req.query?.organization_id;

    try {
      const usePagination =
        req.query?.page !== undefined || req.query?.limit !== undefined;
      const pageNumber = Math.max(parseInt(req.query?.page, 10) || 1, 1);
      const pageSize = Math.min(
        Math.max(parseInt(req.query?.limit, 10) || 20, 1),
        100
      );

      const queryOptions = {
        where: { organization_id: organization_id },
        include: {
          Areas: true, // Includes all related areas
        },
      };

      if (usePagination) {
        queryOptions.skip = (pageNumber - 1) * pageSize;
        queryOptions.take = pageSize;
      }

      const sites = await prisma.sites.findMany(queryOptions);
      logger.info("getSitesAndAreasByOrganizationId fetched sites", {
        meta: { organization_id, site_count: sites.length },
      });
      return res.status(200).json({ organization_id, sites });
    } catch (error) {
      logger?.error("getSitesAndAreasByOrganizationId error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  assignSiteAndAreaToUser: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        user_id: req.params?.userId ?? req.body?.user_id,
      };
      const parsed = assignSiteAndAreaSchema.safeParse(bodyInput);

      if (!parsed.success) {
        const errors = parsed.error.errors.map((err) => err.message);
        return res.status(400).json({ message: "Invalid data", errors });
      }

      const { user_id, site_id, area_id } = parsed.data;

      const user = await prisma.users.findUnique({ where: { user_id } });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const updatedUser = await prisma.users.update({
        where: { user_id },
        data: { site_id, area_id },
        select: {
          first_name: true,
          last_name: true,
          user_id: true,
          site_id: true,
          site: true,
          area_id: true,
          area: true,
        },
      });

      logger.info(`Site and area assigned to user ${user_id}`);
      return res.status(200).json({
        message: "Site and area assigned successfully",

        user: {
          user_id: updatedUser.user_id,
          user_name: `${updatedUser?.first_name} ${updatedUser?.last_name}`,
        },
        area: {
          area_id: updatedUser.area_id,
          area_name: updatedUser.area?.name,
        },
        site: {
          site_id: updatedUser.site_id,
          site_name: updatedUser.site?.name,
        },
      });
    } catch (error) {
      logger.error("assignSiteAndAreaToUser error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  getBuildingAlerts: async (req, res) => {
    try {
      const { building_name } = req.body;
      const { organization_id } = req.user;

      if (!building_name || building_name.trim() === "") {
        return res.status(400).json({ message: "Building name is required" });
      }

      // Fetch the site (building) that matches name and organization
      const site = await prisma.sites.findFirst({
        where: {
          name: building_name,
          organization_id,
        },
        include: {
          Areas: {
            include: {
              Alert_Areas: {
                include: {
                  alert: true,
                },
              },
            },
          },
          Alert_Sites: {
            include: {
              alert: true,
            },
          },
          organization: true,
        },
      });

      if (!site) {
        return res
          .status(404)
          .json({ message: "Building not found in this organization" });
      }

      const allAlerts = [
        ...site.Alert_Sites.map((s) => s.alert),
        ...site.Areas.flatMap((a) => a.Alert_Areas.map((aa) => aa.alert)),
      ];

      const recentAlerts = allAlerts.filter(
        (a) => a.start_time && new Date(a.start_time) < new Date(),
      );
      const upcomingAlerts = allAlerts.filter(
        (a) => a.scheduled_time && new Date(a.scheduled_time) > new Date(),
      );
      const scheduledAlerts = allAlerts.filter((a) => a.status === "scheduled");

      const emergencyContacts = await prisma.users.findMany({
        where: {
          organization_id,
          site_id: site.id,
          role: {
            role_name: {
              in: ["Admin", "Security", "Manager"], // or any emergency roles
            },
          },
        },
        select: {
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
        },
      });

      return res.status(200).json({
        building: site.name,
        recentAlerts,
        upcomingAlerts,
        scheduledAlerts,
        emergencyContacts,
      });
    } catch (error) {
      logger.error("getBuildingAlerts error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
};

export default OrganizationController;












