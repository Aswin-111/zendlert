import path, { dirname } from "path";
import { fileURLToPath } from "url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { AlertStatus } from "@prisma/client";
import { verifyJwt, parseBearerToken } from "../utils/token.js";
import logger from "../utils/logger.js";
import { toGrpcErrorCode } from "../helpers/grpc-error.helper.js";
import { recordEmployeeAlertResponse } from "./employeeAlertResponse.service.js";
import {
  normalizeIncomingDateTimeToUtc,
  utcNow,
} from "../utils/datetime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function handleGrpcError(callback, error, context = "gRPC") {
  // ✅ handle custom service errors
  if (error instanceof AlertServiceError) {
    return callback({
      code: toGrpcErrorCode(error.statusCode),
      message: error.message,
    });
  }

  // ✅ handle already-formed gRPC errors (like from verifyJwt)
  if (error.code && error.message) {
    return callback(error);
  }

  logger.error(`[${context}] error`, { error });

  return callback({
    code: grpc.status.INTERNAL,
    message: "Internal server error",
  });
}

function getAuthContext(call) {
  const authHeader = call.metadata.get("authorization");

  const token = parseBearerToken(authHeader);

  if (!token) {
    throw {
      code: grpc.status.UNAUTHENTICATED,
      message: "Missing or invalid auth token",
    };
  }

  let decoded;
  try {
    decoded = verifyJwt(token);
  } catch (err) {
    throw {
      code: grpc.status.UNAUTHENTICATED,
      message: "Invalid or expired token",
    };
  }

  return {
    user_id: decoded.user_id,
    organization_id: decoded.organization_id,
  };
}

function toProtoTimestamp(date) {
  if (!date) return null;
  const ms = date.getTime();
  return { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1e6 };
}

class AlertServiceError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = "AlertServiceError";
    this.statusCode = statusCode;
    this.details = details;
    Object.assign(this, details);
  }
}

function mapProtoResponseToDbEnum(protoEnumValue) {
  if (protoEnumValue === 1) return "safe";
  if (protoEnumValue === 2) return "need_help";
  if (protoEnumValue === 3) return "emergency_help_needed";
  return null;
}

function mapDbResponseToProtoEnum(dbResponse) {
  if (dbResponse === "safe") return 1;
  if (dbResponse === "need_help") return 2;
  if (dbResponse === "emergency_help_needed") return 3;
  return 0;
}

function buildGrpcAlertRecipientCounts(recipients) {
  const total_employees = recipients.length;
  const responded_recipients = recipients.filter((r) => r.response !== null);
  const responded_employees = responded_recipients.length;

  const safe_count = responded_recipients.filter(
    (r) => r.response === "safe",
  ).length;

  const need_help_count = responded_recipients.filter(
    (r) => r.response === "need_help",
  ).length;

  const emergency_help_needed_count = responded_recipients.filter(
    (r) => r.response === "emergency_help_needed",
  ).length;

  const not_responded_count = total_employees - responded_employees;

  const delivered_count = recipients.filter(
    (r) => r.delivery_status === "delivered",
  ).length;

  return {
    total_employees,
    responded_employees,
    safe_count,
    need_help_count,
    emergency_help_needed_count,
    not_responded_count,
    delivered_count,
  };
}

export async function getAlertDataPayload(prisma, alert_id, organization_id) {
  if (!alert_id) {
    throw new AlertServiceError("alert_id is a required field.", 400);
  }

  if (!organization_id) {
    throw new AlertServiceError("organization_id is required.", 400);
  }

  const alerts = await prisma.alerts.findMany({
    where: {
      id: alert_id,
      organization_id,
    },
    include: {
      emergency_type: { select: { name: true } },
      Alert_Sites: { include: { site: { select: { name: true } } } },
      Alert_Areas: { include: { area: { select: { name: true } } } },
      Notification_Recipients: true,
    },
    take: 1,
  });

  const alert = alerts[0];

  if (!alert) {
    throw new AlertServiceError(`Alert with ID '${alert_id}' not found.`, 404);
  }

  return {
    emergency_type: alert.emergency_type?.name ?? "",
    sites: alert.Alert_Sites.map((as) => as.site.name),
    areas: alert.Alert_Areas.map((aa) => aa.area.name),
    message: alert.message,
    employee_counts: buildGrpcAlertRecipientCounts(alert.Notification_Recipients),
    status: alert.status,
    priority: alert.severity,
    delivered_time: toProtoTimestamp(alert.start_time),
  };
}

export async function resolveSiteAreaTargets(prisma, organization_id, siteSelections) {
  const incomingSiteIds = siteSelections.map((s) => s.site_id);

  const validSites = await prisma.sites.findMany({
    where: { id: { in: incomingSiteIds }, organization_id },
    select: { id: true },
  });

  if (validSites.length !== incomingSiteIds.length) {
    const validSet = new Set(validSites.map((s) => s.id));
    const invalid = incomingSiteIds.filter((id) => !validSet.has(id));
    throw new AlertServiceError(
      "One or more site IDs are invalid or do not belong to the organization.",
      400,
      { invalid_site_ids: invalid },
    );
  }

  const perSiteAreaIds = await Promise.all(
    siteSelections.map(async (sel) => {
      if (!sel.area_ids || sel.area_ids.length === 0) {
        const allAreas = await prisma.areas.findMany({
          where: {
            site_id: sel.site_id,
            site: { organization_id },
          },
          select: { id: true },
        });
        return allAreas.map((a) => a.id);
      }

      const pickedAreas = await prisma.areas.findMany({
        where: {
          site_id: sel.site_id,
          id: { in: sel.area_ids },
          site: { organization_id },
        },
        select: { id: true },
      });

      if (pickedAreas.length !== sel.area_ids.length) {
        const pickedSet = new Set(pickedAreas.map((a) => a.id));
        const invalidAreas = sel.area_ids.filter((id) => !pickedSet.has(id));
        throw new AlertServiceError(
          `One or more area IDs are invalid for site '${sel.site_id}'.`,
          400,
          { invalid_area_ids: invalidAreas },
        );
      }

      return pickedAreas.map((a) => a.id);
    }),
  );

  const finalAreaIdsSet = new Set(perSiteAreaIds.flat());
  const finalAreaIdsArray = Array.from(finalAreaIdsSet);
  return { incomingSiteIds, finalAreaIdsArray };
}

export async function createAlertWithTargets(prisma, params) {
  const {
    user_id,
    organization_id,
    emergency_type_id,
    severity_level,
    alert_message,
    response_required,
    status,
    start_time,
    scheduled_time,
    incomingSiteIds,
    finalAreaIdsArray,
  } = params;

  return prisma.$transaction(async (tx) => {
    const createdAlert = await tx.alerts.create({
      data: {
        user_id,
        organization_id,
        emergency_type_id,
        severity: severity_level,
        message: alert_message,
        response_required,
        status,
        start_time,
        scheduled_time,
      },
    });

    await tx.alert_Sites.createMany({
      data: incomingSiteIds.map((site_id) => ({
        alert_id: createdAlert.id,
        site_id,
      })),
    });

    await tx.alert_Areas.createMany({
      data: finalAreaIdsArray.map((area_id) => ({
        alert_id: createdAlert.id,
        area_id,
      })),
    });

    return createdAlert;
  });
}

export async function createRecipientsForAlert(prisma, alert_id, organization_id, areaIds) {
  const targetUsers = await prisma.users.findMany({
    where: {
      organization_id,
      is_active: true,
      send_emergency_notification: true,
      area_id: { in: areaIds },
    },
    select: { user_id: true },
  });

  if (targetUsers.length > 0) {
    await prisma.notification_Recipients.createMany({
      data: targetUsers.map((u) => ({
        alert_id,
        user_id: u.user_id,
        channel: "in_app",
      })),
      skipDuplicates: true,
    });
  }

  return targetUsers;
}

export async function createAlertForOrganization(
  prisma,
  notificationQueue,
  params,
) {
  const {
    user_id,
    organization_id,
    alert_type,
    severity_level,
    alert_message,
    send_sms,
    response_required,
    timing_details,
    selected_area_details,
  } = params;

  const [user, organization, emergencyType] = await Promise.all([
    prisma.users.findFirst({ where: { user_id, organization_id } }),
    prisma.organizations.findUnique({ where: { organization_id } }),
    prisma.emergency_Types.findFirst({
      where: { name: alert_type, organization_id },
    }),
  ]);

  if (!user) {
    throw new AlertServiceError("User not found.", 404);
  }
  if (!organization) {
    throw new AlertServiceError("Organization not found.", 404);
  }
  if (user.organization_id !== organization_id) {
    throw new AlertServiceError(
      "Forbidden: User does not belong to the organization.",
      403,
    );
  }
  if (!emergencyType) {
    throw new AlertServiceError(
      `Alert type '${alert_type}' not found for this organization.`,
      404,
    );
  }

  const siteSelections = selected_area_details.site_selections;
  const { incomingSiteIds, finalAreaIdsArray } = await resolveSiteAreaTargets(
    prisma,
    organization_id,
    siteSelections,
  );

  if (finalAreaIdsArray.length === 0) {
    throw new AlertServiceError("No areas found to send alert to.", 400);
  }

  const { timing, scheduled_time: scheduledTimeStr } = timing_details;
  const now = utcNow();

  const status =
    timing === "send_now" ? AlertStatus.active : AlertStatus.scheduled;
  const start_time = timing === "send_now" ? now : null;
  const scheduled_time =
    timing === "scheduled"
      ? normalizeIncomingDateTimeToUtc(scheduledTimeStr)
      : null;

  if (status === AlertStatus.scheduled) {
    if (!scheduled_time || Number.isNaN(scheduled_time.getTime())) {
      throw new AlertServiceError("Invalid scheduled_time.", 400);
    }
    if (scheduled_time <= now) {
      throw new AlertServiceError("Scheduled time must be in the future.", 400);
    }
  }

  const newAlert = await createAlertWithTargets(prisma, {
    user_id,
    organization_id,
    emergency_type_id: emergencyType.id,
    severity_level,
    alert_message,
    response_required,
    status,
    start_time,
    scheduled_time,
    incomingSiteIds,
    finalAreaIdsArray,
  });

  await enqueueAlertNotificationJob(notificationQueue, newAlert, send_sms);

  return { newAlert };
}

export async function enqueueAlertNotificationJob(notificationQueue, alert, send_sms) {
  if (alert.status === AlertStatus.active) {
    await notificationQueue.add("send-alert-notifications", {
      alert_id: alert.id,
      send_sms,
    });
    logger.info(`[API] Job added to queue for active alert ${alert.id}`);
    return;
  }

  if (alert.status === AlertStatus.scheduled && alert.scheduled_time) {
    const delay = alert.scheduled_time.getTime() - Date.now();
    if (delay > 0) {
      await notificationQueue.add(
        "send-alert-notifications",
        { alert_id: alert.id, send_sms },
        { delay },
      );
      logger.info(
        `[API] Job scheduled for alert ${alert.id} delay=${Math.round(delay / 1000)}s`,
      );
    }
  }
}

async function sendSmsBatch(recipients) {
  logger.info(
    `[SMS WORKER] Placeholder: Simulating sending of ${recipients.length} SMS messages.`,
  );
}

export async function processAlertNotificationJob(prisma, jobData) {
  const { alert_id, send_sms } = jobData || {};
  const now = utcNow();

  if (!alert_id) {
    throw new AlertServiceError("Alert job payload missing alert_id.", 400);
  }

  const alert = await prisma.alerts.findUnique({
    where: { id: alert_id },
    include: { Alert_Areas: { select: { area_id: true } } },
  });

  if (!alert) {
    throw new AlertServiceError(`Alert ${alert_id} not found.`, 404);
  }

  if (alert.status === AlertStatus.scheduled) {
    await prisma.alerts.update({
      where: { id: alert_id },
      data: {
        status: AlertStatus.active,
        start_time: alert.start_time ?? alert.scheduled_time ?? now,
      },
    });
    logger.info(`[WORKER] Alert ${alert_id} activated from scheduled.`);
  } else if (alert.status === AlertStatus.active) {
    if (!alert.start_time) {
      await prisma.alerts.update({
        where: { id: alert_id },
        data: { start_time: now },
      });
    }
  } else {
    logger.warn(
      `[WORKER] Alert ${alert_id} status=${alert.status}. Skipping dispatch.`,
    );
    return;
  }

  const finalAreaIdsArray = (alert.Alert_Areas || []).map((area) => area.area_id);
  if (finalAreaIdsArray.length === 0) {
    logger.info(`[WORKER] Alert ${alert_id} has no target areas. Done.`);
    return;
  }

  const recipients = await prisma.users.findMany({
    where: {
      organization_id: alert.organization_id,
      is_active: true,
      send_emergency_notification: true,
      area_id: { in: finalAreaIdsArray },
    },
    select: { user_id: true, fcm_token: true, phone_number: true },
  });

  if (recipients.length === 0) {
    logger.info(`[WORKER] No recipients for alert ${alert_id}. Job complete.`);
    return;
  }

  await prisma.notification_Recipients.createMany({
    data: recipients.map((user) => ({
      alert_id,
      user_id: user.user_id,
      channel: "in_app",
    })),
    skipDuplicates: true,
  });

  const recipientsWithFcmTokens = recipients.filter((recipient) => !!recipient.fcm_token);
  if (recipientsWithFcmTokens.length > 0) {
    const tokens = recipientsWithFcmTokens.map((recipient) => recipient.fcm_token);
    logger.info(
      `[FCM WORKER] Placeholder: Would send ${tokens.length} push notifications for alert ${alert_id}.`,
    );
  }

  if (send_sms) {
    const recipientsWithPhone = recipients.filter((recipient) => !!recipient.phone_number);
    if (recipientsWithPhone.length > 0) {
      await sendSmsBatch(
        recipientsWithPhone.map((recipient) => ({
          phone_number: recipient.phone_number,
          message: alert.message,
        })),
      );
    }
  }
}

export async function getAlertDashboardPayload(
  prisma,
  { organization_id, filter, page, limit },
) {
  const skip = (page - 1) * limit;
  const alertListWhereClause = { organization_id };

  if (filter === "active") {
    alertListWhereClause.status = "active";
  } else if (filter === "scheduled") {
    alertListWhereClause.scheduled_time = { gt: new Date() };
  } else if (filter === "history") {
    alertListWhereClause.OR = [{ status: "resolved" }, { status: "ended" }];
  }

  const [
    activeAlertCount,
    alertHistoryCount,
    scheduledAlertCount,
    totalAlerts,
    alertDetails,
    totalEmployees,
    deliveryStatusCounts,
    responseStatusCounts,
  ] = await Promise.all([
    prisma.alerts.count({
      where: { organization_id, status: "active" },
    }),
    prisma.alerts.count({
      where: { organization_id, status: "resolved" },
    }),
    prisma.alerts.count({
      where: { organization_id, scheduled_time: { gt: new Date() } },
    }),
    prisma.alerts.count({
      where: alertListWhereClause,
    }),
    prisma.alerts.findMany({
      where: alertListWhereClause,
      skip,
      take: limit,
      orderBy: { start_time: "desc" },
      select: {
        id: true,
        message: true,
        severity: true,
        status: true,
        emergency_type: {
          select: { name: true },
        },
        Alert_Sites: {
          select: {
            site: {
              select: { name: true },
            },
          },
        },
        Alert_Areas: {
          select: {
            area: {
              select: { name: true },
            },
          },
        },
      },
    }),
    prisma.users.count({
      where: { organization_id },
    }),
    prisma.notification_Recipients.groupBy({
      by: ["delivery_status"],
      where: { alert: { organization_id } },
      _count: { delivery_status: true },
    }),
    prisma.notification_Recipients.groupBy({
      by: ["response"],
      where: { alert: { organization_id } },
      _count: { _all: true },
    }),
  ]);

  const totalDeliveries = deliveryStatusCounts.reduce(
    (sum, row) => sum + Number(row?._count?.delivery_status ?? 0),
    0,
  );
  const deliveredCount = deliveryStatusCounts.reduce(
    (sum, row) =>
      row.delivery_status === "delivered"
        ? sum + Number(row?._count?.delivery_status ?? 0)
        : sum,
    0,
  );

  let safeCount = 0;
  let needHelpCount = 0;
  let emergencyHelpNeededCount = 0;
  let notRespondedCount = 0;

  responseStatusCounts.forEach((row) => {
    const count = Number(row?._count?._all ?? 0);
    if (row.response === "safe") safeCount += count;
    else if (row.response === "need_help") needHelpCount += count;
    else if (row.response === "emergency_help_needed") {
      emergencyHelpNeededCount += count;
    } else if (row.response == null) {
      notRespondedCount += count;
    }
  });

  const deliveryAverage = totalDeliveries
    ? (deliveredCount / totalDeliveries) * 100
    : 0;

  return {
    active_alerts: activeAlertCount,
    alert_history: alertHistoryCount,
    scheduled_alerts: scheduledAlertCount,
    delivery_average: deliveryAverage,
    alerts: alertDetails,
    employee_status: {
      safe: safeCount,
      need_help: needHelpCount,
      emergency_help_needed: emergencyHelpNeededCount,
      not_responded: notRespondedCount,
    },
    delivery_status: deliveryStatusCounts,
    total_employees: totalEmployees,
    pagination: {
      page,
      limit,
      totalAlerts,
      totalPages: Math.ceil(totalAlerts / limit),
    },
  };
}

export async function getDashboardStatsPayload(prisma, organization_id) {
  const [
    active_count,
    scheduled_count,
    history_count,
    total_recipients,
    delivered_recipients,
  ] = await Promise.all([
    prisma.alerts.count({
      where: {
        organization_id,
        status: AlertStatus.active,
      },
    }),
    prisma.alerts.count({
      where: {
        organization_id,
        status: AlertStatus.scheduled,
      },
    }),
    prisma.alerts.count({
      where: {
        organization_id,
        status: {
          notIn: [AlertStatus.active, AlertStatus.scheduled],
        },
      },
    }),
    prisma.notification_Recipients.count({
      where: {
        alert: { organization_id },
      },
    }),
    prisma.notification_Recipients.count({
      where: {
        alert: { organization_id },
        delivery_status: "delivered",
      },
    }),
  ]);

  const delivery_rate =
    total_recipients > 0 ? (delivered_recipients / total_recipients) * 100 : 0;

  return {
    active_count,
    history_count,
    scheduled_count,
    delivery_rate: parseFloat(delivery_rate.toFixed(2)),
  };
}

export async function getAlertTypesForOrganization(prisma, organization_id) {
  return prisma.emergency_Types.findMany({
    where: { organization_id },
    select: {
      id: true,
      organization_id: true,
      name: true,
    },
  });
}

export async function getSitesForOrganization(prisma, organization_id) {
  return prisma.sites.findMany({ where: { organization_id } });
}

export async function getAreasForOrganizationSite(prisma, organization_id, site_id) {
  const site = await prisma.sites.findFirst({
    where: {
      id: site_id,
      organization_id,
    },
  });

  if (!site) {
    throw new AlertServiceError("site doesnt exists", 401);
  }

  return prisma.areas.findMany({
    where: {
      site_id,
      site: { organization_id },
    },
  });
}

export async function getRecipientCountsByAreaPayload(
  prisma,
  organization_id,
  area_ids,
) {
  if (!area_ids) {
    throw new AlertServiceError(
      "organization_id and area_ids are required in the request body.",
      400,
    );
  }

  if (!Array.isArray(area_ids) || area_ids.length === 0) {
    throw new AlertServiceError("area_ids must be a non-empty array.", 400);
  }

  const areaIdArray = area_ids;

  const organization = await prisma.organizations.findUnique({
    where: { organization_id },
    select: { organization_id: true },
  });

  if (!organization) {
    throw new AlertServiceError("Organization not found.", 404);
  }

  const validAreas = await prisma.areas.findMany({
    where: {
      id: { in: areaIdArray },
      site: {
        organization_id,
      },
    },
    select: { id: true },
  });

  if (validAreas.length !== areaIdArray.length) {
    const validAreaIdSet = new Set(validAreas.map((a) => a.id));
    const invalidIds = areaIdArray.filter((id) => !validAreaIdSet.has(id));
    throw new AlertServiceError(
      "One or more area IDs are invalid or do not belong to the specified organization.",
      400,
      { invalid_ids: invalidIds },
    );
  }

  const [employee_count, contractor_count] = await Promise.all([
    prisma.users.count({
      where: {
        organization_id,
        area_id: { in: areaIdArray },
        user_type: "employee",
        is_active: true,
      },
    }),
    prisma.users.count({
      where: {
        organization_id,
        area_id: { in: areaIdArray },
        user_type: "contractor",
        is_active: true,
      },
    }),
  ]);

  return {
    employee_count,
    contractor_count,
    total_recipients: employee_count + contractor_count,
  };
}

export async function resolveAlertForOrganization(
  prisma,
  { organization_id, alert_id, message, resolvedByUserId },
) {
  if (!alert_id || !message) {
    throw new AlertServiceError(
      "organization_id, alert_id, and resolution message are required.",
      400,
    );
  }

  const alerts = await prisma.alerts.findMany({
    where: {
      id: alert_id,
      organization_id,
    },
    take: 1,
  });

  const alert = alerts[0];

  if (!alert) {
    throw new AlertServiceError("Alert not found.", 404);
  }

  if (alert.status !== "active") {
    throw new AlertServiceError(
      `Cannot resolve alert with status '${alert.status}'.`,
      409,
    );
  }

  const now = utcNow();
  await prisma.alerts.update({
    where: { id: alert_id },
    data: {
      status: "resolved",
      end_time: now,
      resolved_at: now,
      resolved_by: resolvedByUserId ?? null,
      resolution_notes: message,
    },
  });
}

async function buildLatestRespondedUserLocationsByAlert(prisma, alertIds) {
  if (!alertIds?.length) return new Map();

  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ON (ul.alert_id::uuid, ul.user_id::uuid)
      ul.alert_id::uuid        AS alert_id,
      ul.user_id::uuid         AS user_id,
      ul.latitude              AS latitude,
      ul.longitude             AS longitude,
      ul.location_name         AS location_name,
      ul."timestamp"           AS "timestamp",
      nr.response              AS response,
      u.first_name             AS first_name,
      u.last_name              AS last_name
    FROM "User_Locations" ul
    INNER JOIN "Notification_Recipients" nr
      ON nr.alert_id::uuid = ul.alert_id::uuid
     AND nr.user_id::uuid  = ul.user_id::uuid
    INNER JOIN "Users" u
      ON u.user_id::uuid   = ul.user_id::uuid
    WHERE ul.alert_id::uuid = ANY(${alertIds}::uuid[])
      AND nr.response IS NOT NULL
    ORDER BY ul.alert_id::uuid, ul.user_id::uuid, ul."timestamp" DESC;
  `;

  const map = new Map();
  for (const id of alertIds) map.set(id, []);

  for (const r of rows) {
    const arr = map.get(r.alert_id);
    if (!arr) continue;

    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    const fullName = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();

    arr.push({
      user_id: r.user_id,
      name: fullName,
      status: mapDbResponseToProtoEnum(String(r.response ?? "")),
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lng) ? lng : 0,
      location_name: r.location_name ?? "",
      timestamp: toProtoTimestamp(r.timestamp ? new Date(r.timestamp) : null),
    });
  }

  return map;
}

async function buildActiveAlertsPayload(prisma, organization_id) {
  const activeAlerts = await prisma.alerts.findMany({
    where: { organization_id, status: AlertStatus.active },
    orderBy: { created_at: "desc" },
    include: { emergency_type: { select: { name: true } } },
  });

  if (!activeAlerts.length) return [];

  const alertIds = activeAlerts.map((a) => a.id);

  const totals = await prisma.notification_Recipients.groupBy({
    by: ["alert_id"],
    where: { alert_id: { in: alertIds } },
    _count: { _all: true },
  });
  const totalMap = new Map(totals.map((t) => [t.alert_id, t._count._all]));

  const responseGroups = await prisma.notification_Recipients.groupBy({
    by: ["alert_id", "response"],
    where: { alert_id: { in: alertIds } },
    _count: { _all: true },
  });

  const maxUpdated = await prisma.notification_Recipients.groupBy({
    by: ["alert_id"],
    where: { alert_id: { in: alertIds }, response_updated_at: { not: null } },
    _max: { response_updated_at: true },
  });
  const lastUpdatedMap = new Map(
    maxUpdated.map((m) => [m.alert_id, m._max.response_updated_at]),
  );

  const [alertSites, alertAreas] = await Promise.all([
    prisma.alert_Sites.findMany({
      where: { alert_id: { in: alertIds } },
      include: { site: { select: { name: true, city: true, state: true } } },
    }),
    prisma.alert_Areas.findMany({
      where: { alert_id: { in: alertIds } },
      include: { area: { select: { name: true, site_id: true } } },
    }),
  ]);

  const siteIdsFromAreas = Array.from(
    new Set(alertAreas.map((x) => x.area?.site_id).filter(Boolean)),
  );

  const sitesForAreas = siteIdsFromAreas.length
    ? await prisma.sites.findMany({
      where: { id: { in: siteIdsFromAreas }, organization_id },
      select: { id: true, name: true },
    })
    : [];

  const siteNameById = new Map(sitesForAreas.map((s) => [s.id, s.name]));
  const locationsByAlertId = new Map();
  for (const id of alertIds) locationsByAlertId.set(id, []);

  for (const row of alertSites) {
    const arr = locationsByAlertId.get(row.alert_id);
    if (!arr) continue;
    const s = row.site;
    if (!s?.name) continue;
    const extra = [s.city, s.state].filter(Boolean).join(", ");
    arr.push(extra ? `${s.name} (${extra})` : s.name);
  }

  for (const row of alertAreas) {
    const arr = locationsByAlertId.get(row.alert_id);
    if (!arr) continue;
    const a = row.area;
    if (!a?.name) continue;
    const siteName = siteNameById.get(a.site_id);
    arr.push(siteName ? `${siteName} - ${a.name}` : a.name);
  }

  const statsByAlert = new Map();
  for (const id of alertIds) {
    statsByAlert.set(id, {
      safe: 0,
      need_help: 0,
      emergency_help_needed: 0,
    });
  }

  for (const row of responseGroups) {
    const s = statsByAlert.get(row.alert_id);
    if (!s) continue;

    if (row.response === "safe") s.safe += row._count._all;
    else if (row.response === "need_help") s.need_help += row._count._all;
    else if (row.response === "emergency_help_needed") {
      s.emergency_help_needed += row._count._all;
    }
  }

  const respondedUserLocationsByAlertId =
    await buildLatestRespondedUserLocationsByAlert(prisma, alertIds);

  return activeAlerts.map((alert) => {
    const totalsForAlert = totalMap.get(alert.id) ?? 0;
    const s = statsByAlert.get(alert.id) ?? {
      safe: 0,
      need_help: 0,
      emergency_help_needed: 0,
    };

    const responded =
      s.safe +
      s.need_help +
      s.emergency_help_needed;

    const notResponded = Math.max(totalsForAlert - responded, 0);

    return {
      alert_id: alert.id,
      emergency_type: alert.emergency_type?.name ?? "",
      message: alert.message ?? "",
      severity: String(alert.severity ?? ""),
      start_time: toProtoTimestamp(alert.start_time ?? alert.created_at),
      safe_count: s.safe,
      need_help_count: s.need_help,
      emergency_help_needed_count: s.emergency_help_needed,
      not_responded_count: notResponded,
      total_recipients: totalsForAlert,
      locations: locationsByAlertId.get(alert.id) ?? [],
      status: String(alert.status ?? ""),
      report: alert.action_required ?? "",
      last_response_updated_at: toProtoTimestamp(
        lastUpdatedMap.get(alert.id) ?? null,
      ),
      user_locations: respondedUserLocationsByAlertId.get(alert.id) ?? [],
    };
  });
}

export function startAlertService(prisma) {
  logger.info("[gRPC Alert] Initializing gRPC Alert Service");

  const protoPath = path.join(__dirname, "../grpc/alert.proto");
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition).alert;

  const getAlertDataHandler = async (call, callback) => {
    try {
      const { organization_id } = getAuthContext(call);

      const payload = await getAlertDataPayload(
        prisma,
        call.request?.alert_id,
        organization_id,
      );

      return callback(null, payload);
    } catch (e) {
      return handleGrpcError(callback, e, "GetAlertData");
    }
  };

  const getActiveAlertsUnary = async (call, callback) => {
    try {
      const { organization_id } = getAuthContext(call);

      const payload = await buildActiveAlertsPayload(
        prisma,
        organization_id,
      );

      return callback(null, { active_alerts: payload });
    } catch (e) {
      return handleGrpcError(callback, e, "GetActiveAlerts");
    }
  };

  const streamActiveAlerts = (call) => {
    let context;

    try {
      context = getAuthContext(call);
    } catch (err) {
      call.emit("error", err);
      return;
    }

    const { organization_id } = context;

    const sendUpdates = async () => {
      if (call.cancelled) return;

      try {
        const payload = await buildActiveAlertsPayload(
          prisma,
          organization_id,
        );

        call.write({ active_alerts: payload });
      } catch (err) {
        logger.error("[StreamActiveAlerts] error", err);
      }
    };

    sendUpdates();

    const interval = setInterval(sendUpdates, 15000);

    call.on("cancelled", () => {
      clearInterval(interval);
      call.end();
    });
  };

  const updateEmployeeResponse = async (call, callback) => {
    try {
      const { alert_id, response } = call.request;

      if (!alert_id || response === undefined) {
        throw new AlertServiceError("Invalid request payload", 400);
      }

      const { user_id, organization_id } = getAuthContext(call);

      const dbResponse = mapProtoResponseToDbEnum(response);

      if (!dbResponse) {
        throw new AlertServiceError("Invalid response type", 400);
      }

      const result = await recordEmployeeAlertResponse({
        alert_id,
        user_id,
        organization_id,
        response: dbResponse,
      });

      return callback(null, {
        ok: true,
        message: "Response updated",
        response_updated_at: toProtoTimestamp(
          result.response_updated_at,
        ),
      });
    } catch (e) {
      return handleGrpcError(callback, e, "UpdateEmployeeResponse");
    }
  };

  const server = new grpc.Server();

  server.addService(proto.AlertService.service, {
    GetAlertData: getAlertDataHandler,
    StreamActiveAlerts: streamActiveAlerts,
    GetActiveAlerts: getActiveAlertsUnary,
    UpdateEmployeeResponse: updateEmployeeResponse,
  });

  const addr = "0.0.0.0:5051";
  server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) {
      logger.error("[gRPC Alert] bind error", { error: err });
      return;
    }
    logger.info(`[gRPC Alert] Service running at ${addr}`);
  });
} 