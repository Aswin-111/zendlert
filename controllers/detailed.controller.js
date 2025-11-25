import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DetailedController = {
  getDetailedStats: async (req, res) => {
    try {
      const { organization_id } = req.query;

      if (!organization_id) {
        return res.status(400).json({
          message: "organization_id query parameter is required.",
        });
      }

      // 1. Check org
      const org = await prisma.organizations.findUnique({
        where: { organization_id },
        select: { organization_id: true },
      });

      if (!org) {
        return res.status(404).json({ message: "Organization not found." });
      }

      // 2. Fetch ALL alert types (this guarantees output won't be empty)
      const alertTypes = await prisma.emergency_Types.findMany({
        where: { organization_id },
        select: { id: true, name: true },
      });

      // 3. Fetch actual alert + recipient data
      const alerts = await prisma.alerts.findMany({
        where: { organization_id },
        include: {
          emergency_type: { select: { id: true, name: true } },
          Notification_Recipients: true,
        },
      });

      // 4. Grouped accumulator
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

      // 5. Fill with real data if available
      alerts.forEach((alert) => {
        const typeId = alert.emergency_type?.id;
        if (!typeId) return; // skip if no emergency_type

        const entry = grouped[typeId];

        entry.total_sent += alert.Notification_Recipients.length;

        alert.Notification_Recipients.forEach((r) => {
          if (r.delivery_status === "delivered") {
            entry.delivered += 1;
          }

          if (r.response !== null && r.acknowledged_at && alert.start_time) {
            entry.responses += 1;
            entry.total_response_seconds +=
              (r.acknowledged_at.getTime() - alert.start_time.getTime()) / 1000;
          }
        });
      });

      // 6. Convert into final UI format
      const result = Object.values(grouped).map((row) => {
        const responseRate =
          row.delivered > 0
            ? parseFloat(((row.responses / row.delivered) * 100).toFixed(1))
            : 0;

        const avgResponseTime =
          row.responses > 0
            ? parseFloat(
                (row.total_response_seconds / row.responses).toFixed(1)
              )
            : 0;

        return {
          alert_type: row.alert_type,
          total_sent: row.total_sent,
          delivered: row.delivered,
          response_rate: responseRate,
          avg_response_time_seconds: avgResponseTime,
        };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching detailed analytics:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
};

export default DetailedController;
