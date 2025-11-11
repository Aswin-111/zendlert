import grpc from '@grpc/grpc-js';
import { UserResponse, DeliveryStatus } from '@prisma/client';

/**
 * gRPC handler for the GetAlertData RPC method.
 * Fetches comprehensive details for a specific alert.
 * @param {object} call - The gRPC call object, containing the request.
 * @param {function} callback - The callback to send the response or error.
 * @param {PrismaClient} prisma - The Prisma client instance.
 */
export async function getAlertData(call, callback, prisma) {
    try {
        const { alert_id } = call.request;

        // 1. Validate input
        if (!alert_id) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: 'alert_id is a required field.',
            });
        }

        // 2. Fetch the alert and all its related data in a single query
        const alert = await prisma.alerts.findUnique({
            where: { id: alert_id },
            include: {
                emergency_type: { select: { name: true } },
                Alert_Sites: { include: { site: { select: { name: true } } } },
                Alert_Areas: { include: { area: { select: { name: true } } } },
                Notification_Recipients: true,
            },
        });

        if (!alert) {
            return callback({
                code: grpc.status.NOT_FOUND,
                message: `Alert with ID '${alert_id}' not found.`,
            });
        }

        // 3. Process Notification Recipient data to calculate counts
        const recipients = alert.Notification_Recipients;
        console.log(recipients)
        const total_employees = recipients.length;

        const responded_recipients = recipients.filter(r => r.response !== null);
        const responded_employees = responded_recipients.length;

        const safe_count = responded_recipients.filter(r => r.response === UserResponse.safe).length;
        const need_help_count = responded_recipients.filter(r => r.response !== UserResponse.safe).length;
        const not_responded_count = total_employees - responded_employees;
        const delivered_count = recipients.filter(r => r.delivery_status === DeliveryStatus.delivered).length;
        console.log(` total_employees : ${total_employees} , responded_employees : ${responded_employees}`)
        const employee_counts = {
            total_employees,
            responded_employees,
            safe_count,
            need_help_count,
            not_responded_count,
            delivered_count,
        };

        // 4. Map the Prisma result to the gRPC response message structure
        const response = {
            emergency_type: alert.emergency_type.name,
            sites: alert.Alert_Sites.map(as => as.site.name),
            areas: alert.Alert_Areas.map(aa => aa.area.name),
            message: alert.message,
            employee_counts: employee_counts,
            status: alert.status,
            priority: alert.severity,
            delivered_time: alert.start_time ? {
                seconds: Math.floor(alert.start_time.getTime() / 1000),
                nanos: (alert.start_time.getTime() % 1000) * 1e6
            } : null,
        };

        // 5. Send the successful response
        callback(null, response);

    } catch (error) {
        console.error("gRPC GetAlertData Error:", error);
        callback({
            code: grpc.status.INTERNAL,
            message: 'An internal error occurred while fetching alert data.',
        });
    }
}