import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
// ===================================================================
// =============== REPORTING HELPER FUNCTIONS ========================
// ===================================================================

/**
 * Helper function to calculate the percentage increase/decrease between two values.
 * Matches the "% Change from Last Month" formulas.
 */
const calculateIncreaseRatio = (current, previous) => {
    if (previous === 0) {
        // As per standard practice, if previous month was 0, any increase is 100%
        return current > 0 ? 100.00 : 0.00;
    }
    const ratio = ((current - previous) / previous) * 100;
    return parseFloat(ratio.toFixed(2));
};

/**
 * A reusable function to process an array of alerts for a given period and return key stats.
 * This helps avoid code duplication for "current month" and "previous month" calculations.
 */
const processAlertsForPeriod = (alerts) => {
    let totalMessagesSent = 0;
    let deliveredMessages = 0;
    let numberOfResponses = 0;
    let totalResponseTimeSeconds = 0;

    alerts.forEach(alert => {
        totalMessagesSent += alert.Notification_Recipients.length;
        alert.Notification_Recipients.forEach(recipient => {
            // Using the lowercase 'delivered' enum value
            if (recipient.delivery_status === DeliveryStatus.delivered) {
                deliveredMessages++;
            }
            // A response is counted if the 'response' field is not null.
            if (recipient.response !== null && recipient.acknowledged_at && alert.start_time) {
                numberOfResponses++;
                // Sum the response time in seconds for each valid response.
                totalResponseTimeSeconds += (recipient.acknowledged_at.getTime() - alert.start_time.getTime()) / 1000;
            }
        });
    });

    return {
        totalMessagesSent,
        deliveredMessages,
        numberOfResponses,
        totalResponseTimeSeconds,
        alertsCount: alerts.length
    };
};

/**
 * Fetches and calculates data for the "Overview" tab.
 * The logic here is built to match your provided formulas exactly.
 */
const getOverviewData = async (organization_id) => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Fetch data for both periods in parallel to improve performance
    const [currentMonthAlerts, lastMonthAlerts, monthlyResponseTimesRaw] = await Promise.all([
        prisma.alerts.findMany({
            where: { organization_id, created_at: { gte: currentMonthStart } },
            include: { Notification_Recipients: true },
        }),
        prisma.alerts.findMany({
            where: { organization_id, created_at: { gte: lastMonthStart, lte: lastMonthEnd } },
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
        `
    ]);

    // Process the fetched data
    const currentStats = processAlertsForPeriod(currentMonthAlerts);
    const previousStats = processAlertsForPeriod(lastMonthAlerts);

    // --- Perform Calculations as per Formulas ---

    // 1. Delivery Success %
    const delivery_success_current = currentStats.totalMessagesSent > 0 ? (currentStats.deliveredMessages / currentStats.totalMessagesSent) * 100 : 0;
    const delivery_success_prev = previousStats.totalMessagesSent > 0 ? (previousStats.deliveredMessages / previousStats.totalMessagesSent) * 100 : 0;

    // 2. Average Response Time
    const avg_response_time_current = currentStats.numberOfResponses > 0 ? (currentStats.totalResponseTimeSeconds / currentStats.numberOfResponses) : 0;
    const avg_response_time_prev = previousStats.numberOfResponses > 0 ? (previousStats.totalResponseTimeSeconds / previousStats.numberOfResponses) : 0;

    // 3. Response Rate %
    const response_rate_current = currentStats.deliveredMessages > 0 ? (currentStats.numberOfResponses / currentStats.deliveredMessages) * 100 : 0;
    const response_rate_prev = previousStats.deliveredMessages > 0 ? (previousStats.numberOfResponses / previousStats.deliveredMessages) * 100 : 0;

    // 4. Number of Alerts This Month
    const alerts_count_current = currentStats.alertsCount;
    const alerts_count_prev = previousStats.alertsCount;

    // Format data for the response time chart
    const response_time_per_month = monthlyResponseTimesRaw.map(row => ({
        month: new Date(row.month).toLocaleString('default', { month: 'long', year: 'numeric' }),
        average_time_seconds: parseFloat(row.avg_response_seconds.toFixed(2))
    }));

    // Assemble final response object
    return {
        delivery_success_rate: {
            value: parseFloat(delivery_success_current.toFixed(2)),
            increase_ratio: calculateIncreaseRatio(delivery_success_current, delivery_success_prev)
        },
        average_response_time: {
            value_seconds: parseFloat(avg_response_time_current.toFixed(2)),
            increase_ratio: calculateIncreaseRatio(avg_response_time_current, avg_response_time_prev)
        },
        average_response_rate: {
            value: parseFloat(response_rate_current.toFixed(2)),
            increase_ratio: calculateIncreaseRatio(response_rate_current, response_rate_prev)
        },
        number_of_alerts_this_month: {
            value: alerts_count_current,
            increase_ratio: calculateIncreaseRatio(alerts_count_current, alerts_count_prev)
        },
        response_time_per_month
    };
};

/**
 * Fetches mock data for the "Performance" tab.
 */
const getPerformanceData = async (organization_id) => {
    // This is a placeholder as the schema doesn't track delivery channel.
    return {
        sms_success_rate: { value: 98.5, average_time_taken_seconds: 15.2 },
        in_app_delivery_success_rate: { value: 99.8, average_time_taken_seconds: 1.8 },
        push_notifications: { delivery_success_rate: 96.2 }
    };
};

/**
 * Fetches and calculates data for the "Details" tab.
 */
const getDetailsData = async (organization_id) => {
    const alerts = await prisma.alerts.findMany({
        where: { organization_id },
        include: {
            emergency_type: { select: { name: true } },
            Notification_Recipients: true,
        }
    });
    const reportsByAlertType = {};
    alerts.forEach(alert => {
        const typeName = alert.emergency_type.name;
        if (!reportsByAlertType[typeName]) {
            reportsByAlertType[typeName] = {
                alert_type: typeName,
                total_send: 0,
                delivered_count: 0,
                responded_count: 0,
                total_response_time_seconds: 0
            };
        }
        const report = reportsByAlertType[typeName];
        const recipients = alert.Notification_Recipients;
        report.total_send += recipients.length;
        recipients.forEach(r => {
            // Using the lowercase 'delivered' enum value
            if (r.delivery_status === DeliveryStatus.delivered) report.delivered_count += 1;
            if (r.response) {
                report.responded_count += 1;
                if (r.acknowledged_at && alert.start_time) {
                    report.total_response_time_seconds += (r.acknowledged_at.getTime() - alert.start_time.getTime()) / 1000;
                }
            }
        });
    });
    return Object.values(reportsByAlertType).map(report => ({
        alert_type: report.alert_type,
        total_send: report.total_send,
        delivered_count: report.delivered_count,
        response_rate: report.delivered_count > 0 ? parseFloat(((report.responded_count / report.delivered_count) * 100).toFixed(2)) : 0,
        average_response_time_seconds: report.responded_count > 0 ? parseFloat((report.total_response_time_seconds / report.responded_count).toFixed(2)) : 0,
        success_rate: report.total_send > 0 ? parseFloat(((report.delivered_count / report.total_send) * 100).toFixed(2)) : 0
    }));
};
const AlertController = {

    getDashboardStats: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "organization_id query parameter is required."
                });
            }

            const [
                active_count,
                scheduled_count,
                history_count,
                total_recipients,
                delivered_recipients
            ] = await Promise.all([
                // Count active alerts using the imported enum
                prisma.alerts.count({
                    where: {
                        organization_id: organization_id,
                        status: AlertStatus.active, // Now using the type-safe enum
                    },
                }),
                // Count scheduled alerts
                prisma.alerts.count({
                    where: {
                        organization_id: organization_id,
                        status: AlertStatus.scheduled, // Using enum
                    },
                }),
                // Count historical alerts
                prisma.alerts.count({
                    where: {
                        organization_id: organization_id,
                        status: {
                            notIn: [AlertStatus.active, AlertStatus.scheduled], // Using enum
                        },
                    },
                }),
                // The rest of the logic remains the same
                prisma.notification_Recipients.count({
                    where: {
                        alert: { organization_id: organization_id },
                    },
                }),
                prisma.notification_Recipients.count({
                    where: {
                        alert: { organization_id: organization_id },
                        // Assuming you also create a DeliveryStatus enum for this field
                        delivery_status: DeliveryStatus.DELIVERED,
                    },
                }),
            ]);

            const delivery_rate = total_recipients > 0 ?
                (delivered_recipients / total_recipients) * 100 :
                0;

            res.status(200).json({
                active_count,
                history_count,
                scheduled_count,
                delivery_rate: parseFloat(delivery_rate.toFixed(2)),
            });

        } catch (error) {
            console.error("Error fetching alert dashboard stats:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An error occurred while fetching dashboard statistics."
            });
        }
    },

    /**
      * @description Get comprehensive report data for an organization.
      * @route GET /api/v1/alert/get_reports
      */
    getReports: async (req, res) => {
        try {
            const { organization_id, filter } = req.query;
            if (!organization_id || !filter) {
                return res.status(400).json({ error: "organization_id and filter are required query parameters." });
            }
            // --- ADDED: VALIDATION CHECK FOR ORGANIZATION ID ---
            const organization = await prisma.organizations.findUnique({
                where: {
                    organization_id: organization_id
                },
                // We only need to know if it exists, so selecting the ID is efficient.
                select: {
                    organization_id: true
                }
            });

            if (!organization) {
                return res.status(404).json({ error: "Organization not found." });
            }
            // --- END OF VALIDATION CHECK ---
            let data;
            switch (filter) {
                case 'overview':
                    data = await getOverviewData(organization_id);
                    break;
                case 'performance':
                    data = await getPerformanceData(organization_id);
                    break;
                case 'details':
                    data = await getDetailsData(organization_id);
                    break;
                default:
                    return res.status(400).json({ error: "Invalid filter. Use 'overview', 'performance', or 'details'." });
            }

            res.status(200).json(data);
        } catch (error) {
            console.error("Error fetching report data:", error);
            res.status(500).json({ error: "An internal server error occurred." });
        }
    }



}



export default AlertController