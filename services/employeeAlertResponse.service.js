// services/employeeAlertResponse.service.js
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import { utcNow } from "../utils/datetime.js";

export const ALLOWED_RESPONSES = ["safe", "need_help", "emergency_help_needed"];

class EmployeeAlertResponseServiceError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = "EmployeeAlertResponseServiceError";
    this.statusCode = statusCode;
    this.details = details;
    Object.assign(this, details);
  }
}

function ensureAllowedResponse(response) {
  if (ALLOWED_RESPONSES.includes(response)) {
    return;
  }
  throw new EmployeeAlertResponseServiceError("Invalid response", 400);
}

async function findAlertForResponse(tx, alert_id) {
  const alert = await tx.alerts.findUnique({
    where: { id: alert_id },
    select: { id: true, status: true, scheduled_time: true },
  });

  if (!alert) {
    throw new EmployeeAlertResponseServiceError("Alert not found", 404);
  }

  return alert;
}

async function upsertRecipientResponse(tx, { alert, alert_id, user_id, response }) {
  const now = utcNow();
  const newHistoryEntry = { response, at: now.toISOString() };

  const existing = await tx.notification_Recipients.findUnique({
    where: {
      alert_id_user_id: { alert_id, user_id },
    },
    select: {
      acknowledged_at: true,
      delivery_status: true,
      response_history: true,
    },
  });

  const mergedHistory = Array.isArray(existing?.response_history)
    ? [...existing.response_history, newHistoryEntry]
    : [newHistoryEntry];

  const recipient = await tx.notification_Recipients.upsert({
    where: {
      alert_id_user_id: { alert_id, user_id },
    },
    create: {
      alert_id,
      user_id,
      channel: "in_app",
      delivery_status: "delivered",
      delivered_at: now,
      acknowledged_at: now,
      response,
      response_updated_at: now,
      response_history: [newHistoryEntry],
    },
    update: {
      response,
      response_updated_at: now,
      acknowledged_at: existing?.acknowledged_at ?? now,
      response_history: mergedHistory,
      ...(existing?.delivery_status !== "delivered"
        ? { delivery_status: "delivered", delivered_at: now }
        : {}),
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

  if (alert.status === "scheduled") {
    await tx.alerts.updateMany({
      where: { id: alert_id, status: "scheduled" },
      data: { status: "active", start_time: alert.scheduled_time ?? now },
    });
  }

  return recipient;
}

/**
 * Requires Prisma schema:
 * model Notification_Recipients {
 *   ...
 *   alert_id String
 *   user_id  String
 *   @@unique([alert_id, user_id], name: "alert_id_user_id")
 * }
 *
 * Behavior:
 * - ALWAYS 1 row per (alert_id, user_id) (no duplicates)
 * - Response can be updated multiple times (overwrites response fields)
 * - response_history appends entries each time (optional, keep or remove)
 * - Marks delivered if not already delivered
 * - If alert is scheduled, nudge to active on first response
 *
 * NOTE: This service NO LONGER writes user_Locations.
 * Your controller already writes user_Locations (history). Keep it there to avoid double inserts.
 */
export async function recordEmployeeAlertResponse({
  alert_id,
  user_id,
  response,
}) {
  try {
    ensureAllowedResponse(response);
    const recipient = await prisma.$transaction(async (tx) => {
      const alert = await findAlertForResponse(tx, alert_id);
      return upsertRecipientResponse(tx, { alert, alert_id, user_id, response });
    });
    return recipient;
  } catch (error) {
    logger.error("recordEmployeeAlertResponse failed", {
      error,
      meta: { alert_id, user_id },
    });
    throw error;
  }
}

export async function recordEmployeeAlertResponseWithLocation({
  alert_id,
  user_id,
  response,
  latitude,
  longitude,
  location_name = null,
}) {
  try {
    ensureAllowedResponse(response);

    const hasLocation =
      typeof latitude === "number" && typeof longitude === "number";

    return await prisma.$transaction(async (tx) => {
      const alert = await findAlertForResponse(tx, alert_id);

      let saved_location = null;
      if (hasLocation) {
        saved_location = await tx.user_Locations.create({
          data: {
            user_id,
            alert_id,
            latitude: latitude.toString(),
            longitude: longitude.toString(),
            location_name: location_name ?? null,
          },
          select: {
            id: true,
            user_id: true,
            alert_id: true,
            latitude: true,
            longitude: true,
            location_name: true,
            timestamp: true,
          },
        });
      }

      const recipient = await upsertRecipientResponse(tx, {
        alert,
        alert_id,
        user_id,
        response,
      });

      return { recipient, saved_location };
    });
  } catch (error) {
    logger.error("recordEmployeeAlertResponseWithLocation failed", {
      error,
      meta: { alert_id, user_id },
    });
    throw error;
  }
}
