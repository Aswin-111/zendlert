import { PrismaClient, UserTypes } from "@prisma/client";
import { Resend } from "resend";
import bcrypt from "bcrypt";
import z from "zod";
import createOrganizationSchema from "../validators/organization/create-org.validator.js";
import createSiteSchema from "../validators/organization/create-site.validator.js";
import createAreaSchema from "../validators/organization/create-area.validator.js";
import createEmployeeSchema from "../validators/organization/create-employee.validator.js";

import redisClient from "../utils/redis.client.js"; // Redis
import logger from "../utils/logger.js";
const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_KEY);
import jwt from "jsonwebtoken";
const OTP_EXPIRY_SECONDS = 600;
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};
const assignSchema = z.object({
  user_id: z.string({ required_error: "User ID is required" }),
  site_id: z.string({ required_error: "Site ID is required" }),
  area_id: z.string({ required_error: "Area ID is required" }),
});
const OrganizationController = {
  checkBusinessName: async (req, res) => {
    try {
      const { business_name } = req.query;
      // console.log(business_name)
      if (!business_name || typeof business_name !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "Invalid business_name" });
      }

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
      const { email } = req.body;

      // -------------------------
      // 1. Basic email validation
      // -------------------------
      if (!email || typeof email !== "string") {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      if (!email.includes("@")) {
        return res.status(400).json({
          success: false,
          message: "Email must contain '@'.",
        });
      }

      const domain = email.split("@")[1]?.trim().toLowerCase();

      if (!domain || domain.length < 3) {
        return res.status(400).json({
          success: false,
          message: "Invalid email domain.",
        });
      }

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
      const { email } = req.body;

      if (
        !email ||
        typeof email !== "string" ||
        !email.includes("@") ||
        email.split("@")[1].trim().length < 3
      ) {
        return res
          .status(400)
          .json({ message: "Invalid or missing email address." });
      }

      const domain = email.split("@")[1].toLowerCase();
      // const org = await prisma.organizations.findUnique({
      //   where: { email_domain: domain },
      // });

      // if (!org) {
      //   return res.status(404).json({
      //     message: "Organization not found for provided email domain.",
      //   });
      // }

      const otp = generateOtp();

      // Store OTP in Redis with expiry
      await redisClient.setEx(`otp:${email}`, OTP_EXPIRY_SECONDS, otp);

      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: [email],
        subject: "OTP for Organization Verification",
        html: `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fc; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px;">
      <h2 style="color: #2c3e50;">🚀 Welcome to Emertify!</h2>
     
      <p style="font-size: 16px;">
        To complete your setup, please use the following OTP:
      </p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2c3e50; background-color: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 6px;">
        ${otp}
      </p>
      <p style="font-size: 14px; color: #777; margin-top: 20px;">
        This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
      </p>
      <hr style="margin: 30px 0;" />
      <p style="font-size: 14px; color: #999;">
        If you did not request this, please ignore this email.<br/>
        Need help? Contact support at <a href="mailto:support@yourcompany.com" style="color: #3498db;">support@yourcompany.com</a>.
      </p>
    </div>
  </div>
`,
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
  verifyOtp: async (req, res) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
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
  loginWithOtp: async (req, res) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required." });
      }

      const storedOtp = await redisClient.get(`otp:${email}`);

      if (storedOtp !== otp) {
        return res.status(401).json({ message: "Invalid or expired OTP." });
      }

      // OTP valid → delete it
      await redisClient.del(`otp:${email}`);

      // Fetch user
      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase() },
        include: { role: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create token
      const token = jwt.sign(
        {
          user_id: user.user_id,
          email: user.email,
          role: user.role?.role_name,
          organization_id: user.organization_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.TOKEN_EXPIRY }
      );

      return res.status(200).json({
        message: "Login successful",
        token,
        user: {
          user_id: user.user_id,
          organization_id: user.organization_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role?.role_name,
        },
      });
    } catch (error) {
      logger.error("loginWithOtp error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
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
      const [firstName, ...rest] = full_name.trim().split(" ");
      const lastName = rest.join(" ");
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

      return res.status(200).json({
        message: "Organization created successfully",
        organization: newOrg,
        user: {
          email: newUser.email,
          name: newUser.first_name,
          role: adminRole.role_name,
          user_id: newUser.user_id,
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
      const { user_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ message: "User ID is required." });
      }

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
      const {
        name,
        industry_type_id,
        main_contact_name,
        main_contact_email,
        main_contact_phone,
        organization_id,
      } = req.body;

      if (!organization_id) {
        return res
          .status(400)
          .json({ message: "Organization ID is required." });
      }

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
  createSite: async (req, res) => {
    try {
      const parsed = createSiteSchema.safeParse(req.body);
      console.log(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((err) => err.message);
        console.log(req.body);
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
  getAllSites: async (req, res) => {
    try {
      const { organization_id } = req.query;
      const sites = await prisma.sites.findMany({
        where: { organization_id },
        orderBy: { created_at: "desc" }, // optional sorting
        select: {
          id: true,
          name: true,
        },
        // include: {
        //   organization: {
        //     select: {
        //       name: true,
        //       organization_id: true,
        //     },
        //   },
        // },
      });
      console.log(sites);
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
      console.error("createArea error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  // employee signup route
  checkEmailForEmployee: async (req, res) => {
    try {
      const { domain } = req.query;
      console.log(domain);
      const checkDomainSchema = z.object({
        domain: z
          .string()
          .email()
          .transform((val) => val.split("@")[1])
          .refine((val) => !!val, {
            message: "Invalid email format. Must include a domain.",
          }),
      });
      const parsed = checkDomainSchema.safeParse({ domain });
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
      console.error("checkEmailDomain error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  sendOtpForEmployeeSignup: async (req, res) => {
    try {
      const { email } = req.body;

      if (
        !email ||
        typeof email !== "string" ||
        !email.includes("@") ||
        email.split("@")[1].trim().length < 3
      ) {
        return res
          .status(400)
          .json({ message: "Invalid or missing email address." });
      }

      const domain = email.split("@")[1].toLowerCase();
      // const org = await prisma.organizations.findUnique({
      //   where: { email_domain: domain },
      // });

      // if (!org) {
      //   return res.status(404).json({
      //     message: "Organization not found for provided email domain.",
      //   });
      // }

      const otp = generateOtp();

      // Store OTP in Redis with expiry
      await redisClient.setEx(`otp:${email}`, OTP_EXPIRY_SECONDS, otp);

      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: [email],
        subject: "OTP for Employee Verification",
        html: `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fc; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px;">
      <h2 style="color: #2c3e50;">🚀 Welcome to Emertify!</h2>
     
      <p style="font-size: 16px;">
        To complete your setup, please use the following OTP:
      </p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2c3e50; background-color: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 6px;">
        ${otp}
      </p>
      <p style="font-size: 14px; color: #777; margin-top: 20px;">
        This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
      </p>
      <hr style="margin: 30px 0;" />
      <p style="font-size: 14px; color: #999;">
        If you did not request this, please ignore this email.<br/>
        Need help? Contact support at <a href="mailto:support@yourcompany.com" style="color: #3498db;">support@yourcompany.com</a>.
      </p>
    </div>
  </div>
`,
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

      if (!email || !otp) {
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
      const [first_name, ...rest] = full_name.trim().split(" ");
      const last_name = rest.join(" ") || "";
      console.log("Password : ", password, " Password hash : ", password_hash);

      // 6. Create the new user and associate them with the found organization
      const newUser = await prisma.users.create({
        data: {
          email: email.toLowerCase(),
          password_hash,
          first_name,
          last_name,
          phone_number: phone,
          is_active: true,
          user_type: "employee", // Note: user_type is an enum, so direct string is fine
          role_id: role.id,
          organization_id: organization_id, // Use the organization_id found via domain
        },
      });

      return res.status(201).json({
        message: `Employee joined under '${existingOrg.name}' successfully`,
        organization_id: organization_id,
        user: {
          role: role.role_name,
          user_id: newUser.user_id,
          email: newUser.email,
          full_name: full_name,
        },
      });
    } catch (error) {
      console.log(error);
      logger.error("createEmployee error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  // employee login

  getSitesAndAreasByOrganizationId: async (req, res) => {
    const { organization_id } = req.query;

    try {
      const sites = await prisma.sites.findMany({
        where: { organization_id: organization_id },
        include: {
          Areas: true, // Includes all related areas
        },
      });
      console.log(`organization_id:${organization_id}`, sites);
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
      const parsed = assignSchema.safeParse(req.body);

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
        (a) => a.start_time && new Date(a.start_time) < new Date()
      );
      const upcomingAlerts = allAlerts.filter(
        (a) => a.scheduled_time && new Date(a.scheduled_time) > new Date()
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
