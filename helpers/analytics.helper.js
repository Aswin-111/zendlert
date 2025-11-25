import { PrismaClient } from "@prisma/client";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

const prisma = new PrismaClient();


/**
 * Helper: Process alerts for a given period
 */
const processAlertsForPeriod = (alerts) => {
  let totalMessagesSent = 0;
  let deliveredMessages = 0;
  let numberOfResponses = 0;
  let totalResponseTimeSeconds = 0;

  alerts.forEach((alert) => {
    totalMessagesSent += alert.Notification_Recipients.length;

    alert.Notification_Recipients.forEach((recipient) => {
      if (recipient.delivery_status === "delivered") {
        deliveredMessages++;
      }

      if (
        recipient.response !== null &&
        recipient.acknowledged_at &&
        alert.start_time
      ) {
        numberOfResponses++;
        totalResponseTimeSeconds +=
          (recipient.acknowledged_at.getTime() -
            alert.start_time.getTime()) /
          1000;
      }
    });
  });

  return {
    totalMessagesSent,
    deliveredMessages,
    numberOfResponses,
    totalResponseTimeSeconds,
    alertsCount: alerts.length,
  };
};
/**
 * Helper: Calculate percentage increase/decrease between two values
 */
const calculateIncreaseRatio = (current, previous) => {
  if (previous === 0) {
    // If previous month was 0, avoid division by zero
    return current > 0 ? 100.0 : 0.0;
  }

  const ratio = ((current - previous) / previous) * 100;
  return parseFloat(ratio.toFixed(2));
};



/**
 * Fetches and calculates data for the "Overview" tab.
 * The logic here is built to match your provided formulas exactly.
 */


export const getOverviewData = async (organization_id) => {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  // Fetch data for both periods in parallel to improve performance
  const [currentMonthAlerts, lastMonthAlerts, monthlyResponseTimesRaw] =
    await Promise.all([
      prisma.alerts.findMany({
        where: { organization_id, created_at: { gte: currentMonthStart } },
        include: { Notification_Recipients: true },
      }),
      prisma.alerts.findMany({
        where: {
          organization_id,
          created_at: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        include: { Notification_Recipients: true },
      }),
      // This query fetches data for the monthly response time chart
      prisma.$queryRaw`
            SELECT 
                DATE_TRUNC('month', a.created_at)::DATE as month,
                AVG(EXTRACT(EPOCH FROM (nr.acknowledged_at - a.start_time))) as avg_response_seconds
            FROM "Alerts" a
            JOIN "Notification_Recipients" nr ON a.id = nr.alert_id
            WHERE a.organization_id = ${organization_id}
              AND a.created_at >= ${subMonths(now, 12)}
              AND nr.acknowledged_at IS NOT NULL
            GROUP BY month
            ORDER BY month;
        `,
    ]);

  // Process the fetched data
  const currentStats = processAlertsForPeriod(currentMonthAlerts);
  const previousStats = processAlertsForPeriod(lastMonthAlerts);

  // --- Perform Calculations as per Formulas ---

  // 1. Delivery Success %
  const delivery_success_current =
    currentStats.totalMessagesSent > 0
      ? (currentStats.deliveredMessages / currentStats.totalMessagesSent) * 100
      : 0;
  const delivery_success_prev =
    previousStats.totalMessagesSent > 0
      ? (previousStats.deliveredMessages / previousStats.totalMessagesSent) *
        100
      : 0;

  // 2. Average Response Time
  const avg_response_time_current =
    currentStats.numberOfResponses > 0
      ? currentStats.totalResponseTimeSeconds / currentStats.numberOfResponses
      : 0;
  const avg_response_time_prev =
    previousStats.numberOfResponses > 0
      ? previousStats.totalResponseTimeSeconds / previousStats.numberOfResponses
      : 0;

  // 3. Response Rate %
  const response_rate_current =
    currentStats.deliveredMessages > 0
      ? (currentStats.numberOfResponses / currentStats.deliveredMessages) * 100
      : 0;
  const response_rate_prev =
    previousStats.deliveredMessages > 0
      ? (previousStats.numberOfResponses / previousStats.deliveredMessages) *
        100
      : 0;

  // 4. Number of Alerts This Month
  const alerts_count_current = currentStats.alertsCount;
  const alerts_count_prev = previousStats.alertsCount;

  // Format data for the response time chart
  const response_time_per_month = monthlyResponseTimesRaw.map((row) => ({
    month: new Date(row.month).toLocaleString("default", {
      month: "long",
      year: "numeric",
    }),
    average_time_seconds: parseFloat(row.avg_response_seconds.toFixed(2)),
  }));

  // Assemble final response object
  return {
    delivery_success_rate: {
      value: parseFloat(delivery_success_current.toFixed(2)),
      increase_ratio: calculateIncreaseRatio(
        delivery_success_current,
        delivery_success_prev
      ),
    },
    average_response_time: {
      value_seconds: parseFloat(avg_response_time_current.toFixed(2)),
      increase_ratio: calculateIncreaseRatio(
        avg_response_time_current,
        avg_response_time_prev
      ),
    },
    average_response_rate: {
      value: parseFloat(response_rate_current.toFixed(2)),
      increase_ratio: calculateIncreaseRatio(
        response_rate_current,
        response_rate_prev
      ),
    },
    number_of_alerts_this_month: {
      value: alerts_count_current,
      increase_ratio: calculateIncreaseRatio(
        alerts_count_current,
        alerts_count_prev
      ),
    },
    response_time_per_month,
  };
};
/**
 * Fetches mock data for the "Performance" tab.
 */
export const getPerformanceData = async (organization_id) => {
  // This is a placeholder as the schema doesn't track delivery channel.
  return {
    sms_success_rate: { value: 98.5, average_time_taken_seconds: 15.2 },
    in_app_delivery_success_rate: {
      value: 99.8,
      average_time_taken_seconds: 1.8,
    },
    push_notifications: { delivery_success_rate: 96.2 },
  };
};
/**
 * Fetches and calculates data for the "Details" tab.
 */
export const getDetailsData = async (organization_id) => {
  const alerts = await prisma.alerts.findMany({
    where: { organization_id },
    include: {
      emergency_type: { select: { name: true } },
      Notification_Recipients: true,
    },
  });
  const reportsByAlertType = {};
  alerts.forEach((alert) => {
    const typeName = alert.emergency_type.name;
    if (!reportsByAlertType[typeName]) {
      reportsByAlertType[typeName] = {
        alert_type: typeName,
        total_send: 0,
        delivered_count: 0,
        responded_count: 0,
        total_response_time_seconds: 0,
      };
    }
    const report = reportsByAlertType[typeName];
    const recipients = alert.Notification_Recipients;
    report.total_send += recipients.length;
    recipients.forEach((r) => {
      // Using the lowercase 'delivered' enum value
      if (r.delivery_status === DeliveryStatus.delivered)
        report.delivered_count += 1;
      if (r.response) {
        report.responded_count += 1;
        if (r.acknowledged_at && alert.start_time) {
          report.total_response_time_seconds +=
            (r.acknowledged_at.getTime() - alert.start_time.getTime()) / 1000;
        }
      }
    });
  });
  return Object.values(reportsByAlertType).map((report) => ({
    alert_type: report.alert_type,
    total_send: report.total_send,
    delivered_count: report.delivered_count,
    response_rate:
      report.delivered_count > 0
        ? parseFloat(
            ((report.responded_count / report.delivered_count) * 100).toFixed(2)
          )
        : 0,
    average_response_time_seconds:
      report.responded_count > 0
        ? parseFloat(
            (
              report.total_response_time_seconds / report.responded_count
            ).toFixed(2)
          )
        : 0,
    success_rate:
      report.total_send > 0
        ? parseFloat(
            ((report.delivered_count / report.total_send) * 100).toFixed(2)
          )
        : 0,
  }));
};
