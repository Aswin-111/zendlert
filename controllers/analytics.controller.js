import { DeliveryStatus } from "@prisma/client";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import {
  getOverviewData,
  getPerformanceData as getHelperPerformanceData,
  getPerformanceReportData,
  getDetailsData,
} from "../helpers/analytics.helper.js";
import { getOrganizationIdOrUnauthorized } from "../helpers/alert-controller.helper.js";
import { findOrganizationById } from "../helpers/ownership.helper.js";
import { reportsFilterQuerySchema } from "../validators/analytics/reports-query.validator.js";

const AnalyticsController = {
  getReports: async (req, res) => {
    try {
      const organization_id = getOrganizationIdOrUnauthorized(req, res);
      if (!organization_id) return;
      const parsedQuery = reportsFilterQuerySchema.safeParse(req.query ?? {});
      const { filter } = parsedQuery.success ? parsedQuery.data : {};

      if (!parsedQuery.success && req.query?.filter === undefined) {
        return res.status(400).json({
          error: "organization_id and filter are required query parameters.",
        });
      }
      if (!parsedQuery.success) {
        return res.status(400).json({
          error: "Invalid filter. Use 'overview', 'performance', or 'details'.",
        });
      }

      const organization = await findOrganizationById(prisma, organization_id, {
        select: { organization_id: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found." });
      }

      let data;
      switch (filter) {
        case "overview":
          data = await getOverviewData(organization_id);
          break;
        case "performance":
          data = await getHelperPerformanceData(organization_id);
          break;
        case "details":
          data = await getDetailsData(organization_id);
          break;
        default:
          return res.status(400).json({
            error: "Invalid filter. Use 'overview', 'performance', or 'details'.",
          });
      }

      return res.status(200).json(data);
    } catch (error) {
      logger.error("Error fetching report data:", { error });
      return res.status(500).json({ error: "An internal server error occurred." });
    }
  },

  getEmergencyTypePercentages: async (req, res) => {
    try {
      const organization_id = getOrganizationIdOrUnauthorized(req, res);
      if (!organization_id) return;

      const countsByType = await prisma.alerts.groupBy({
        by: ["emergency_type_id"],
        _count: { emergency_type_id: true },
        where: { organization_id },
      });

      const totalAlerts = countsByType.reduce(
        (sum, item) => sum + item._count.emergency_type_id,
        0
      );

      const emergencyTypeIds = countsByType.map((item) => item.emergency_type_id);
      const emergencyTypes = await prisma.emergency_Types.findMany({
        where: { id: { in: emergencyTypeIds } },
        select: { id: true, name: true },
      });

      const result = countsByType.map((item) => {
        const type = emergencyTypes.find((t) => t.id === item.emergency_type_id);
        return {
          name: type ? type.name : "Unknown",
          count: item._count.emergency_type_id,
          percentage:
            totalAlerts > 0
              ? ((item._count.emergency_type_id / totalAlerts) * 100).toFixed(2)
              : "0.00",
        };
      });

      return res.status(200).json({
        total_alerts: totalAlerts,
        emergency_type_percentages: result,
      });
    } catch (error) {
      logger.error("Error fetching emergency type percentages:", { error });
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },

  getPerformanceReport: async (req, res) => {
    try {
      const organization_id = getOrganizationIdOrUnauthorized(req, res);
      if (!organization_id) return;

      const { report, hasAnyRecords } = await getPerformanceReportData(
        organization_id,
        { withMeta: true },
      );

      // Keep legacy behavior: when no analytics rows exist, return 404 only if org does not exist.
      if (!hasAnyRecords) {
        const org = await findOrganizationById(prisma, organization_id, {
          select: { organization_id: true },
        });

        if (!org) {
          return res.status(404).json({ message: "Organization not found." });
        }
      }

      return res.status(200).json(report);
    } catch (error) {
      logger.error("Analytics performance error:", { error });
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },

  getDetailedStats: async (req, res) => {
    try {
      const organization_id = getOrganizationIdOrUnauthorized(req, res);
      if (!organization_id) return;

      const alertTypes = await prisma.emergency_Types.findMany({
        where: { organization_id },
        select: { id: true, name: true },
      });

      const alerts = await prisma.alerts.findMany({
        where: { organization_id },
        select: {
          start_time: true,
          emergency_type: { select: { id: true, name: true } },
          Notification_Recipients: {
            select: {
              delivery_status: true,
              response: true,
              acknowledged_at: true,
            },
          },
        },
      });

      const grouped = {};

      alertTypes.forEach((t) => {
        grouped[t.id] = {
          alert_type: t.name,
          total_sent: 0,
          delivered: 0,
          responses: 0,
          total_response_seconds: 0,
        };
      });

      alerts.forEach((alert) => {
        const typeId = alert.emergency_type?.id;
        if (!typeId) return;

        const entry = grouped[typeId];

        entry.total_sent += alert.Notification_Recipients.length;

        alert.Notification_Recipients.forEach((r) => {
          if (r.delivery_status === DeliveryStatus.delivered) {
            entry.delivered += 1;
          }

          if (r.response !== null && r.acknowledged_at && alert.start_time) {
            entry.responses += 1;
            entry.total_response_seconds +=
              (r.acknowledged_at.getTime() - alert.start_time.getTime()) / 1000;
          }
        });
      });

      const result = Object.values(grouped).map((row) => {
        const responseRate =
          row.delivered > 0
            ? parseFloat(((row.responses / row.delivered) * 100).toFixed(1))
            : 0;

        const avgResponseTime =
          row.responses > 0
            ? parseFloat((row.total_response_seconds / row.responses).toFixed(1))
            : 0;

        return {
          alert_type: row.alert_type,
          total_sent: row.total_sent,
          delivered: row.delivered,
          response_rate: responseRate,
          avg_response_time_seconds: avgResponseTime,
        };
      });

      if (result.length === 0) {
        const org = await findOrganizationById(prisma, organization_id, {
          select: { organization_id: true },
        });
        if (!org) {
          return res.status(404).json({ message: "Organization not found." });
        }
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error("Error fetching detailed analytics:", { error });
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
};

export default AnalyticsController;
