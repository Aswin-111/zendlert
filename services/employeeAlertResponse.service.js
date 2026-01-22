import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const ALLOWED_RESPONSES = ["safe", "need_help", "emergency_help_needed"];

/**
 * Records employee response to an alert.
 * - Ensures Notification_Recipients row exists and is updated
 * - Appends response_history
 * - Marks delivered if needed
 * - Optionally stores User_Locations snapshot
 * - Keeps your existing behavior: if alert was scheduled, nudge to active on first response
 */
export async function recordEmployeeAlertResponse({
    alert_id,
    user_id,
    response,
    latitude,
    longitude,
    location_name,
}) {
    if (!ALLOWED_RESPONSES.includes(response)) {
        const err = new Error("Invalid response");
        err.statusCode = 400;
        throw err;
    }

    // ✅ Validate alert exists
    const alert = await prisma.alerts.findUnique({
        where: { id: alert_id },
        select: { id: true, status: true, scheduled_time: true },
    });

    if (!alert) {
        const err = new Error("Alert not found");
        err.statusCode = 404;
        throw err;
    }

    // ✅ Find recipient (alert-user). If missing, create it so dashboard metrics include the response.
    let recipient = await prisma.notification_Recipients.findFirst({
        where: { alert_id, user_id },
        select: {
            id: true,
            response: true,
            response_history: true,
            acknowledged_at: true,
            delivery_status: true,
        },
    });

    const now = new Date();
    const newHistoryEntry = { response, at: now.toISOString() };

    const result = await prisma.$transaction(async (tx) => {
        // Optional: snapshot user location if lat/long provided
        if (latitude != null && longitude != null) {
            await tx.user_Locations.create({
                data: {
                    user_id,
                    alert_id,
                    latitude: latitude.toString(),
                    longitude: longitude.toString(),
                    location_name: location_name ?? null,
                },
            });
        }

        if (!recipient) {
            // Create if missing
            recipient = await tx.notification_Recipients.create({
                data: {
                    alert_id,
                    user_id,
                    // Once user responds, mark delivered
                    delivery_status: "delivered",
                    delivered_at: now,
                    acknowledged_at: now,
                    response,
                    response_updated_at: now,
                    response_history: [newHistoryEntry],
                },
                select: {
                    id: true,
                    alert_id: true,
                    user_id: true,
                    response: true,
                    response_updated_at: true,
                    acknowledged_at: true,
                    response_history: true,
                    delivery_status: true,
                },
            });
        } else {
            // Update existing
            recipient = await tx.notification_Recipients.update({
                where: { id: recipient.id },
                data: {
                    response,
                    response_updated_at: now,
                    acknowledged_at: recipient.acknowledged_at ?? now,
                    response_history: Array.isArray(recipient.response_history)
                        ? [...recipient.response_history, newHistoryEntry]
                        : [newHistoryEntry],
                    ...(recipient.delivery_status !== "delivered" && {
                        delivery_status: "delivered",
                        delivered_at: now,
                    }),
                },
                select: {
                    id: true,
                    alert_id: true,
                    user_id: true,
                    response: true,
                    response_updated_at: true,
                    acknowledged_at: true,
                    response_history: true,
                    delivery_status: true,
                },
            });
        }

        // Optional: if alert was "scheduled" and someone responded, nudge it to "active"
        if (alert.status === "scheduled") {
            await tx.alerts.update({
                where: { id: alert_id },
                data: { status: "active", start_time: alert.scheduled_time ?? now },
            });
        }

        return recipient;
    });

    return result;
}
