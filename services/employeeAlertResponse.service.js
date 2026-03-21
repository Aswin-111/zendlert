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

async function findAlertForResponse(tx, alert_id, organization_id) {
  const alerts = await tx.alerts.findMany({
    where: {
      id: alert_id,
      organization_id,
    },
    select: {
      id: true,
      organization_id: true,
      status: true,
      scheduled_time: true,
    },
    take: 1,
  });

  const alert = alerts[0];

  if (!alert) {
    throw new EmployeeAlertResponseServiceError("Alert not found", 404);
  }

  if (alert.status !== "active" && alert.status !== "scheduled") {
    throw new EmployeeAlertResponseServiceError(
      `Cannot respond to alert with status '${alert.status}'`,
      409,
    );
  }

  return alert;
}

async function ensureUserBelongsToOrganization(tx, user_id, organization_id) {
  const users = await tx.users.findMany({
    where: {
      user_id,
      organization_id,
      is_active: true,
    },
    select: {
      user_id: true,
      organization_id: true,
    },
    take: 1,
  });

  const user = users[0];

  if (!user) {
    throw new EmployeeAlertResponseServiceError(
      "User not found in this organization",
      403,
    );
  }

  return user;
}

async function findExistingRecipientOrThrow(tx, alert_id, user_id) {
  const recipient = await tx.notification_Recipients.findUnique({
    where: {
      alert_id_user_id: { alert_id, user_id },
    },
    select: {
      id: true,
      alert_id: true,
      user_id: true,
      acknowledged_at: true,
      delivery_status: true,
      response_history: true,
    },
  });

  if (!recipient) {
    throw new EmployeeAlertResponseServiceError(
      "User is not a recipient of this alert",
      403,
    );
  }

  return recipient;
}

async function updateRecipientResponse(tx, { alert, alert_id, user_id, response }) {
  const now = utcNow();
  const newHistoryEntry = { response, at: now.toISOString() };

  const existing = await findExistingRecipientOrThrow(tx, alert_id, user_id);

  const mergedHistory = Array.isArray(existing?.response_history)
    ? [...existing.response_history, newHistoryEntry]
    : [newHistoryEntry];

  const recipient = await tx.notification_Recipients.update({
    where: {
      alert_id_user_id: { alert_id, user_id },
    },
    data: {
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
      where: {
        id: alert_id,
        organization_id: alert.organization_id,
        status: "scheduled",
      },
      data: {
        status: "active",
        start_time: alert.scheduled_time ?? now,
      },
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
 * - Requires alert to belong to the caller's organization
 * - Requires user to belong to the same organization
 * - Requires an existing recipient row for (alert_id, user_id)
 * - Response can be updated multiple times
 * - response_history appends entries each time
 * - Marks delivered if not already delivered
 * - If alert is scheduled, nudges it to active on first response
 *
 * NOTE:
 * - This service does NOT auto-create notification recipient rows
 * - This service does NOT write user_Locations
 */
export async function recordEmployeeAlertResponse({
  alert_id,
  user_id,
  organization_id,
  response,
}) {
  try {
    ensureAllowedResponse(response);

    const recipient = await prisma.$transaction(async (tx) => {
      const alert = await findAlertForResponse(tx, alert_id, organization_id);

      await ensureUserBelongsToOrganization(tx, user_id, organization_id);

      return updateRecipientResponse(tx, {
        alert,
        alert_id,
        user_id,
        response,
      });
    });

    return recipient;
  } catch (error) {
    logger.error("recordEmployeeAlertResponse failed", {
      error,
      meta: { alert_id, user_id, organization_id },
    });
    throw error;
  }
}

export async function recordEmployeeAlertResponseWithLocation({
  alert_id,
  user_id,
  organization_id,
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
      const alert = await findAlertForResponse(tx, alert_id, organization_id);

      await ensureUserBelongsToOrganization(tx, user_id, organization_id);

      await findExistingRecipientOrThrow(tx, alert_id, user_id);

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

      const recipient = await updateRecipientResponse(tx, {
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
      meta: { alert_id, user_id, organization_id },
    });
    throw error;
  }
}