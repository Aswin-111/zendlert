// controllers/overview.controller.js
import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger.js"; // make sure this exists
const prisma = new PrismaClient();
import {
  getOverviewData,
  getPerformanceData,
  getDetailsData,
} from "../helpers/analytics.helper.js";

const OverviewController = {
  /**
   * @description Get comprehensive report data for an organization.
   * @route GET /api/v1/alert/get_reports
   */
  getReports: async (req, res) => {
    try {
      const { organization_id, filter } = req.query;
      if (!organization_id || !filter) {
        return res.status(400).json({
          error: "organization_id and filter are required query parameters.",
        });
      }
      // --- ADDED: VALIDATION CHECK FOR ORGANIZATION ID ---
      const organization = await prisma.organizations.findUnique({
        where: {
          organization_id: organization_id,
        },
        // We only need to know if it exists, so selecting the ID is efficient.
        select: {
          organization_id: true,
        },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found." });
      }
      // --- END OF VALIDATION CHECK ---
      let data;
      switch (filter) {
        case "overview":
          data = await getOverviewData(organization_id);
          break;
        case "performance":
          data = await getPerformanceData(organization_id);
          break;
        case "details":
          data = await getDetailsData(organization_id);
          break;
        default:
          return res.status(400).json({
            error:
              "Invalid filter. Use 'overview', 'performance', or 'details'.",
          });
      }

      res.status(200).json(data);
    } catch (error) {
      console.error("Error fetching report data:", error);
      res.status(500).json({ error: "An internal server error occurred." });
    }
  },
  /**
   * @route GET /api/v1/analytics/overview/emergency-type-percentages
   * @description Get a summary overview of key metrics
   */
  getEmergencyTypePercentages: async (req, res) => {
    try {
      const { organization_id } = req.query;

      if (!organization_id) {
        return res
          .status(400)
          .json({ message: "organization_id query parameter is required." });
      }

      // Group alerts by emergency_type_id and count
      const countsByType = await prisma.alerts.groupBy({
        by: ["emergency_type_id"],
        _count: {
          emergency_type_id: true,
        },
        where: {
          organization_id,
        },
      });

      // Calculate total alerts for the organization
      const totalAlerts = countsByType.reduce(
        (sum, item) => sum + item._count.emergency_type_id,
        0
      );

      // Get emergency type details (names)
      const emergencyTypeIds = countsByType.map(
        (item) => item.emergency_type_id
      );
      const emergencyTypes = await prisma.emergency_Types.findMany({
        where: {
          id: { in: emergencyTypeIds },
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Map counts to names and calculate percentage
      const result = countsByType.map((item) => {
        const type = emergencyTypes.find(
          (t) => t.id === item.emergency_type_id
        );
        return {
          name: type ? type.name : "Unknown",
          count: item._count.emergency_type_id,
          percentage:
            totalAlerts > 0
              ? ((item._count.emergency_type_id / totalAlerts) * 100).toFixed(2)
              : "0.00",
        };
      });

      res.status(200).json({
        total_alerts: totalAlerts,
        emergency_type_percentages: result,
      });
    } catch (error) {
      console.error("Error fetching emergency type percentages:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
};
export default OverviewController;
