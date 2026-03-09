import { AlertStatus } from "@prisma/client";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import createAlertSchema from "../validators/alert/create-alert.validator.js";
import { notificationQueue } from "../services/queue.service.js";
import {
  getOrganizationIdOrUnauthorized,
  respondWithKnownServiceError,
} from "../helpers/alert-controller.helper.js";
import {
  createAlertForOrganization,
  getAlertDashboardPayload,
  getAlertTypesForOrganization,
  getAreasForOrganizationSite,
  getDashboardStatsPayload,
  getRecipientCountsByAreaPayload,
  getSitesForOrganization,
  resolveAlertForOrganization,
} from "../services/alert.service.js";

const AlertController = {
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
  getDashboardStats: async (req, res) => {
    try {
      const organizationId = getOrganizationIdOrUnauthorized(req, res);
      if (!organizationId) return;

      const payload = await getDashboardStatsPayload(prisma, organizationId);
      res.status(200).json(payload);
    } catch (error) {
      logger.error("Error fetching alert dashboard stats:", { error });
      res.status(500).json({
        error: "Internal Server Error",
        message: "An error occurred while fetching dashboard statistics.",
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
  getRecipientCountsByArea: async (req, res) => {
    try {
      const organizationId = getOrganizationIdOrUnauthorized(req, res);
      if (!organizationId) return;

      const { area_ids } = req.body;

      const payload = await getRecipientCountsByAreaPayload(
        prisma,
        organizationId,
        area_ids,
      );
      return res.status(200).json(payload);
    } catch (error) {
      if (respondWithKnownServiceError(res, error, [400, 404], {
        400: (err) => (err.invalid_ids ? { invalid_ids: err.invalid_ids } : {}),
      })) return;

      logger.error("getRecipientCountsByArea error:", { error });
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
  createAlert: async (req, res) => {
    try {
      const validation = createAlertSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: validation.error.flatten(),
        });
      }

      const {
        user_id,
        organization_id,
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
        message: `Alert has been successfully ${newAlert.status === AlertStatus.active ? "queued for dispatch" : "scheduled"}.`,
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
      return res.status(500).json({ message: "Server error", error: error.message });
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
};

export default AlertController;

