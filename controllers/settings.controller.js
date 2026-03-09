// controllers/settings.controller.js
import logger from "../utils/logger.js"; // make sure this exists
import prisma from "../utils/prisma.js";
import {
  organizationIdQuerySchema,
  alertTypeListQuerySchema,
  alertTypeMutationQuerySchema,
  createAlertTypeBodySchema,
  updateAlertTypeBodySchema,
  createSeverityLevelBodySchema,
  severityLevelListQuerySchema,
  editSeverityLevelBodySchema,
  deleteSeverityLevelQuerySchema,
} from "../validators/settings/settings.validator.js";
import { findOrganizationById } from "../helpers/ownership.helper.js";

const SettingsController = {
  /**
   * GET /api/v1/settings/get-organization-info?organization_id=UUID
   * Returns:
   *  - company_name
   *  - industry_type_name
   *  - primary_contact_name
   *  - phone_number
   *  - email
   */
  getOrganizationInfo: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
      };
      const parsedQuery = organizationIdQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res
          .status(400)
          .json({ message: "organization_id is required" });
      }
      const { organization_id } = parsedQuery.data;

      const org = await findOrganizationById(prisma, organization_id, {
        select: {
          name: true,
          main_contact_name: true,
          main_contact_phone: true,
          main_contact_email: true,
          industry_type: { select: { name: true } },
        },
      });

      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const data = {
        company_name: org.name,
        industry_type_name: org.industry_type?.name ?? null,
        primary_contact_name: org.main_contact_name ?? null,
        phone_number: org.main_contact_phone ?? null,
        email: org.main_contact_email ?? null,
      };

      return res.status(200).json(data);
    } catch (error) {
      logger.error("getOrganizationInfo error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  /**
 * GET /api/v1/settings/get-alert-types?organization_id=UUID
 * Returns all emergency types for the specified organization
 */
  getAlertTypes: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
      };
      const parsedQuery = alertTypeListQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res
          .status(400)
          .json({ message: "organization_id is required" });
      }
      const { organization_id, page, limit } = parsedQuery.data;
      const usePagination = page !== undefined || limit !== undefined;
      const pageNum = page ?? 1;
      const limitNum = limit ?? 20;

      const queryOptions = {
        where: { organization_id: String(organization_id) },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      };

      if (usePagination) {
        queryOptions.skip = (pageNum - 1) * limitNum;
        queryOptions.take = limitNum;
      }

      const emergencyTypes = await prisma.emergency_Types.findMany({
        ...queryOptions,
      });

      if (!emergencyTypes || emergencyTypes.length === 0) {
        return res.status(404).json({
          message: "No emergency types found for this organization.",
        });
      }

      return res.status(200).json({
        organization_id,
        total: emergencyTypes.length,
        emergency_types: emergencyTypes,
      });
    } catch (error) {
      logger.error("getAlertTypes error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  /**
 * POST /api/v1/settings/alert-type
 * Body:
 * {
 *   "organization_id": "UUID",
 *   "name": "Fire",
 *   "description": "Fire or explosion incidents"
 * }
 */
  createAlertType: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        organization_id: req.user?.organization_id ?? req.body?.organization_id,
      };
      const parsedBody = createAlertTypeBodySchema.safeParse(bodyInput);
      if (!parsedBody.success) {
        return res
          .status(400)
          .json({ message: "organization_id and name are required" });
      }
      const { organization_id, name, description } = parsedBody.data;

      // Check if organization exists
      const orgExists = await findOrganizationById(prisma, organization_id);

      if (!orgExists) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if the emergency type already exists in this organization
      const existingType = await prisma.emergency_Types.findFirst({
        where: {
          organization_id: String(organization_id),
          name: name.trim(),
        },
      });

      if (existingType) {
        return res.status(409).json({
          message: "An emergency type with this name already exists for this organization",
        });
      }

      // Create the new emergency type
      const newType = await prisma.emergency_Types.create({
        data: {
          organization_id: String(organization_id),
          name: name.trim(),
          description: description || null,
        },
      });

      return res.status(201).json({
        message: "Emergency type created successfully",
        emergency_type: newType,
      });
    } catch (error) {
      logger.error("createAlertType error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  /**
   * PUT /api/v1/settings/alert-type?organization_id=UUID&alert_type_id=UUID
   * Body: (send only what needs to be updated)
   * {
   *   "name": "Updated Fire Alert",
   *   "description": "Updated description text"
   * }
   */
  updateAlertType: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
        alert_type_id: req.params?.alertTypeId ?? req.query?.alert_type_id,
      };
      const parsedQuery = alertTypeMutationQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res
          .status(400)
          .json({ message: "organization_id and alert_type_id are required" });
      }
      const { organization_id, alert_type_id } = parsedQuery.data;

      const parsedBody = updateAlertTypeBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res
          .status(400)
          .json({ message: "No fields provided to update" });
      }
      const { name, description } = parsedBody.data;

      // Check if the emergency type exists and belongs to this organization
      const existingType = await prisma.emergency_Types.findFirst({
        where: {
          id: String(alert_type_id),
          organization_id: String(organization_id),
        },
      });

      if (!existingType) {
        return res
          .status(404)
          .json({ message: "Emergency type not found for this organization" });
      }

      // Build update data dynamically — only include provided fields
      const updateData = {};
      if (name) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;

      if (Object.keys(updateData).length === 0) {
        return res
          .status(400)
          .json({ message: "No fields provided to update" });
      }

      const updatedType = await prisma.emergency_Types.update({
        where: { id: String(alert_type_id) },
        data: updateData,
      });

      return res.status(200).json({
        message: "Emergency type updated successfully",
        emergency_type: updatedType,
      });
    } catch (error) {
      logger.error("updateAlertType error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  /**
  * DELETE /api/v1/settings/alert-type?organization_id=UUID&alert_type_id=UUID
  */
  deleteAlertType: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
        alert_type_id: req.params?.alertTypeId ?? req.query?.alert_type_id,
      };
      const parsedQuery = alertTypeMutationQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res
          .status(400)
          .json({ message: "organization_id and alert_type_id are required" });
      }
      const { organization_id, alert_type_id } = parsedQuery.data;

      // Check if the emergency type exists for the organization
      const existingType = await prisma.emergency_Types.findFirst({
        where: {
          id: String(alert_type_id),
          organization_id: String(organization_id),
        },
      });

      if (!existingType) {
        return res
          .status(404)
          .json({ message: "Emergency type not found for this organization" });
      }

      // Delete the emergency type
      await prisma.emergency_Types.delete({
        where: { id: String(alert_type_id) },
      });

      return res.status(200).json({
        message: "Emergency type deleted successfully",
        deleted_id: alert_type_id,
      });
    } catch (error) {
      logger.error("deleteAlertType error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

   // CREATE Severity Level
  createSeverityLevel: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        organization_id: req.user?.organization_id ?? req.body?.organization_id,
      };
      const parsedBody = createSeverityLevelBodySchema.safeParse(bodyInput);
      if (!parsedBody.success) {
        return res.status(400).json({ message: "organization_id and severity_name are required" });
      }
      const { organization_id, severity_name, description } = parsedBody.data;

      // Check if organization already exists
      const orgExists = await findOrganizationById(prisma, organization_id);
      if (!orgExists) {
        return res.status(404).json({ message: "organization not exist" });
      }

      // Check if severity name exists for this org
      const sevExists = await prisma.severity_Levels.findFirst({
        where: {
          organization_id: String(organization_id),
          name: severity_name.trim()
        }
      });
      if (sevExists) {
        return res.status(409).json({ message: "severity name already exists" });
      }

      // Create new severity level
      const newSeverity = await prisma.severity_Levels.create({
        data: {
          organization_id: String(organization_id),
          name: severity_name.trim(),
          description: description || null
        }
      });

      return res.status(201).json({
        message: "Severity level created successfully",
        severity_level: newSeverity
      });
    } catch (error) {
      logger.error("createSeverityLevel error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
   // GET ALL Severity Levels for organization
  getAllSeverityLevels: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
      };
      const parsedQuery = severityLevelListQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res.status(400).json({ message: "organization_id is required" });
      }
      const { organization_id, page, limit } = parsedQuery.data;
      const usePagination = page !== undefined || limit !== undefined;
      const pageNum = page ?? 1;
      const limitNum = limit ?? 20;

      // Check organization exists
      const orgExists = await findOrganizationById(prisma, organization_id);
      if (!orgExists) {
        return res.status(404).json({ message: "organization not exist" });
      }

      const queryOptions = {
        where: { organization_id: String(organization_id) },
        select: { id: true, name: true, description: true },
      };

      if (usePagination) {
        queryOptions.skip = (pageNum - 1) * limitNum;
        queryOptions.take = limitNum;
      }

      const severityLevels = await prisma.severity_Levels.findMany({
        ...queryOptions
      });

      if (!severityLevels.length) {
        return res.status(404).json({ message: "No severity levels found for this organization." });
      }

      return res.status(200).json({
        organization_id,
        total: severityLevels.length,
        severity_levels: severityLevels
      });
    } catch (error) {
      logger.error("getAllSeverityLevels error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
   // EDIT Severity Level
  editSeverityLevel: async (req, res) => {
    try {
      const bodyInput = {
        ...(req.body ?? {}),
        organization_id: req.user?.organization_id ?? req.body?.organization_id,
        id: req.params?.severityLevelId ?? req.body?.id,
      };
      const parsedBody = editSeverityLevelBodySchema.safeParse(bodyInput);
      if (!parsedBody.success) {
        return res.status(400).json({ message: "organization_id and severity_level id are required" });
      }
      const { organization_id, severity_name, description, id } = parsedBody.data;

      // Check organization exists
      const orgExists = await findOrganizationById(prisma, organization_id);
      if (!orgExists) {
        return res.status(404).json({ message: "organization not exist" });
      }

      // Check severity exists
      const severityExists = await prisma.severity_Levels.findUnique({
        where: { id: String(id) }
      });
      if (!severityExists) {
        return res.status(404).json({ message: "severity not exist" });
      }

      // Build update data
      const updateData = {};
      if (severity_name) {
        // Check for duplicate severity_name
        const nameExists = await prisma.severity_Levels.findFirst({
          where: {
            id: { not: String(id) },
            organization_id: String(organization_id),
            name: severity_name.trim()
          }
        });
        if (nameExists) {
          return res.status(409).json({ message: "severity name already exists" });
        }
        updateData.name = severity_name.trim();
      }
      if (description !== undefined) updateData.description = description;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields provided to update" });
      }

      const updatedSeverity = await prisma.severity_Levels.update({
        where: { id: String(id) },
        data: updateData
      });

      return res.status(200).json({
        message: "Severity level updated successfully",
        severity_level: updatedSeverity
      });
    } catch (error) {
      logger.error("editSeverityLevel error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
// DELETE Severity Level
  deleteSeverityLevel: async (req, res) => {
    try {
      const queryInput = {
        ...(req.query ?? {}),
        organization_id: req.user?.organization_id ?? req.query?.organization_id,
        id: req.params?.severityLevelId ?? req.query?.id,
      };
      const parsedQuery = deleteSeverityLevelQuerySchema.safeParse(queryInput);
      if (!parsedQuery.success) {
        return res.status(400).json({ message: "organization_id and severity_level id are required" });
      }
      const { organization_id, id } = parsedQuery.data;

      // Check organization exists
      const orgExists = await findOrganizationById(prisma, organization_id);
      if (!orgExists) {
        return res.status(404).json({ message: "organization not exist" });
      }

      // Check severity exists
      const severityExists = await prisma.severity_Levels.findUnique({
        where: { id: String(id) }
      });
      if (!severityExists) {
        return res.status(404).json({ message: "severity not exist" });
      }

      await prisma.severity_Levels.delete({
        where: { id: String(id) }
      });

      return res.status(200).json({
        message: "Severity level deleted successfully",
        deleted_id: id
      });
    } catch (error) {
      logger.error("deleteSeverityLevel error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }


};

export default SettingsController;
