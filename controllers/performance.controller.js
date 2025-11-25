import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ============================
 * Helper: Delivery Rate
 * ============================
 */
const getDeliveryRate = async (organization_id, channel) => {
  const total = await prisma.notification_Recipients.count({
    where: {
      alert: { organization_id },
      channel,
    },
  });

  const delivered = await prisma.notification_Recipients.count({
    where: {
      alert: { organization_id },
      channel,
      delivery_status: "delivered",
    },
  });

  const percentage =
    total === 0 ? 0 : parseFloat(((delivered / total) * 100).toFixed(1));

  return {
    total,
    delivered,
    percentage,
  };
};

/**
 * ============================
 * Helper: Average Response Time (seconds)
 * ============================
 */
const getAvgResponseTime = async (organization_id, channel) => {
  const records = await prisma.notification_Recipients.findMany({
    where: {
      alert: { organization_id },
      channel,
      acknowledged_at: { not: null },
      delivered_at: { not: null },
    },
    select: {
      delivered_at: true,
      acknowledged_at: true,
    },
  });

  if (records.length === 0) return 0;

  let totalMs = 0;

  records.forEach((r) => {
    totalMs += new Date(r.acknowledged_at) - new Date(r.delivered_at);
  });

  const avgSeconds = totalMs / records.length / 1000;

  return parseFloat(avgSeconds.toFixed(1));
};

/**
 * ===================================
 * MAIN PERFORMANCE ANALYTICS FUNCTION
 * ===================================
 */
const getPerformanceData = async (organization_id) => {
  // SMS
  const sms_delivery = await getDeliveryRate(organization_id, "sms");
  const sms_avg_time = await getAvgResponseTime(organization_id, "sms");

  // IN-APP
  const inapp_delivery = await getDeliveryRate(organization_id, "in_app");
  const inapp_avg_time = await getAvgResponseTime(organization_id, "in_app");

  // PUSH
  const push_delivery = await getDeliveryRate(organization_id, "push");
  const push_avg_time = await getAvgResponseTime(organization_id, "push");

  return {
    sms: {
      success_rate: sms_delivery.percentage,
      average_time_seconds: sms_avg_time,
    },
    in_app: {
      success_rate: inapp_delivery.percentage,
      average_time_seconds: inapp_avg_time,
    },
    push: {
      success_rate: push_delivery.percentage,
      average_time_seconds: push_avg_time,
    },
  };
};

/**
 * ===========================
 * EXPORT CONTROLLER
 * ===========================
 */
const PerformanceController = {
  /**
   * @route GET /api/v1/alerts/analytics/performance
   * @description Main performance analytics endpoint
   */
  getPerformanceReport: async (req, res) => {
    try {
      const { organization_id } = req.query;

      if (!organization_id) {
        return res
          .status(400)
          .json({ message: "organization_id query parameter is required." });
      }

      const org = await prisma.organizations.findUnique({
        where: { organization_id },
        select: { organization_id: true },
      });

      if (!org) {
        return res.status(404).json({ message: "Organization not found." });
      }

      const result = await getPerformanceData(organization_id);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Analytics performance error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
};

export default PerformanceController;
