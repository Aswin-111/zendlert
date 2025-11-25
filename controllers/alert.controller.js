import { PrismaClient, AlertStatus, SeverityLevel } from "@prisma/client";
import { z } from "zod";
import { Queue, Worker } from "bullmq";
import logger from "../utils/logger.js"; // your Winston logger

const prisma = new PrismaClient();

// ===================================================================
// ========== QUEUE AND WORKER SETUP (FOR BACKGROUND JOBS) ===========
// ===================================================================
// NOTE: For production, this worker and queue setup should be in a
// separate file and run as a separate process.

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
};

// 1. The Notification Queue for sending alerts
const notificationQueue = new Queue("notificationQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry a job up to 3 times if it fails
    backoff: { type: "exponential", delay: 1000 }, // Exponential backoff for retries
  },
});

// 2. The Notification Worker Logic
const startNotificationWorker = () => {
  console.log("🟢 Initializing Notification Worker...");

  // Placeholder function for sending SMS messages via Twilio.
  const sendSmsBatch = async (recipients) => {
    console.log(
      `[SMS WORKER] Placeholder: Simulating sending of ${recipients.length} SMS messages.`
    );
    // TODO: Implement actual Twilio SMS pool sending logic here.
  };

  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      const { alert_id, send_sms } = job.data;
      logger.info(`[WORKER] Processing job ${job.id} for alert ${alert_id}`);

      try {
        // CRITICAL STEP: Atomically update alert status to 'active' and get its data.
        // This handles scheduled alerts correctly, making them active when their time comes.
        const alert = await prisma.alerts.update({
          where: { id: alert_id },
          data: { status: "active", start_time: new Date() },
          include: { Alert_Areas: { select: { area_id: true } } },
        });

        if (!alert)
          throw new Error(`Alert ${alert_id} not found during update.`);
        logger.info(`[WORKER] Alert ${alert_id} status updated to ACTIVE.`);

        const finalAreaIdsArray = alert.Alert_Areas.map((a) => a.area_id);
        const recipients = await prisma.users.findMany({
          where: { area_id: { in: finalAreaIdsArray }, is_active: true },
          select: { user_id: true, fcm_token: true, phone_number: true },
        });

        if (recipients.length === 0) {
          logger.info(
            `[WORKER] No recipients for alert ${alert_id}. Job complete.`
          );
          return;
        }

        // Create notification records for tracking responses
        await prisma.notification_Recipients.createMany({
          data: recipients.map((user) => ({
            alert_id: alert.id,
            user_id: user.user_id,
          })),
          skipDuplicates: true,
        });

        // Handle FCM Push Notifications
        const recipientsWithFcmTokens = recipients.filter((r) => r.fcm_token);
        if (recipientsWithFcmTokens.length > 0) {
          const tokens = recipientsWithFcmTokens.map((r) => r.fcm_token);
          const message = {
            notification: {
              title: `ALERT: ${alert.severity.toUpperCase()}`,
              body: alert.message,
            },
            tokens,
            data: { alert_id: alert.id },
          };
          const response = await admin.messaging().sendMulticast(message);
          logger.info(
            `[FCM WORKER] Successfully sent ${response.successCount} push notifications for alert ${alert.id}.`
          );
          if (response.failureCount > 0) {
            logger.warn(
              `[FCM WORKER] Failed to send ${response.failureCount} push notifications for alert ${alert.id}.`
            );
          }
        }

        // Handle SMS Notifications
        if (send_sms) {
          const recipientsWithPhone = recipients.filter((r) => r.phone_number);
          if (recipientsWithPhone.length > 0) {
            await sendSmsBatch(
              recipientsWithPhone.map((r) => ({
                phone_number: r.phone_number,
                message: alert.message,
              }))
            );
          }
        }
      } catch (error) {
        logger.error(`[WORKER] Job ${job.id} failed for alert ${alert_id}:`, {
          error,
        });
        throw error; // Let BullMQ handle the retry according to the backoff strategy
      }
    },
    { connection: redisConnection }
  );

  worker.on("failed", (job, err) =>
    logger.error(`Job ${job.id} has failed with ${err.message}`)
  );
  console.log("🟢 Notification Worker is running and listening for jobs.");
};

// Initialize the worker as soon as the application starts
startNotificationWorker();

/**
 * Helper function to calculate the percentage increase/decrease between two values.
 * Matches the "% Change from Last Month" formulas.
 */
// const calculateIncreaseRatio = (current, previous) => {
//   if (previous === 0) {
//     // As per standard practice, if previous month was 0, any increase is 100%
//     return current > 0 ? 100.0 : 0.0;
//   }
//   const ratio = ((current - previous) / previous) * 100;
//   return parseFloat(ratio.toFixed(2));
// };

// /**
//  * A reusable function to process an array of alerts for a given period and return key stats.
//  * This helps avoid code duplication for "current month" and "previous month" calculations.
//  */
// const processAlertsForPeriod = (alerts) => {
//   let totalMessagesSent = 0;
//   let deliveredMessages = 0;
//   let numberOfResponses = 0;
//   let totalResponseTimeSeconds = 0;

//   alerts.forEach((alert) => {
//     totalMessagesSent += alert.Notification_Recipients.length;
//     alert.Notification_Recipients.forEach((recipient) => {
//       // Using the lowercase 'delivered' enum value
//       if (recipient.delivery_status === DeliveryStatus.delivered) {
//         deliveredMessages++;
//       }
//       // A response is counted if the 'response' field is not null.
//       if (
//         recipient.response !== null &&
//         recipient.acknowledged_at &&
//         alert.start_time
//       ) {
//         numberOfResponses++;
//         // Sum the response time in seconds for each valid response.
//         totalResponseTimeSeconds +=
//           (recipient.acknowledged_at.getTime() - alert.start_time.getTime()) /
//           1000;
//       }
//     });
//   });

//   return {
//     totalMessagesSent,
//     deliveredMessages,
//     numberOfResponses,
//     totalResponseTimeSeconds,
//     alertsCount: alerts.length,
//   };
// };



// ===================================================================
// =================== ZOD VALIDATION SCHEMA =========================
// ===================================================================
const createAlertSchema = z.object({
  user_id: z.string().uuid("Invalid user ID format."),
  organization_id: z.string().uuid("Invalid organization ID format."),
  alert_type: z.string().min(1, "Alert type is required."),
  severity_level: z.nativeEnum(SeverityLevel),
  alert_message: z.string().min(1, "Alert message is required."),
  send_sms: z.boolean(),
  response_required: z.boolean(),
  timing_details: z
    .object({
      timing: z.enum(["send_now", "scheduled"]),
      scheduled_time: z.string().optional(),
    })
    .refine((data) => data.timing !== "scheduled" || data.scheduled_time, {
      message: "scheduled_time is required for scheduled alerts.",
    }),
  selected_area_details: z.object({
    site_selections: z
      .array(
        z.object({
          site_id: z.string().uuid("Invalid site ID format."),
          area_ids: z.array(z.string().uuid("Invalid area ID format.")),
        })
      )
      .min(1, "At least one site must be selected."),
  }),
});
const AlertController = {
  // alert main dashboard
  getAlertDashboard: async (req, res) => {
    try {
      const { organization_id, filter } = req.query; // filter can be 'active', 'scheduled', 'history'
      const page = parseInt(req.query.page) || 1;
      const limit = 5;
      const skip = (page - 1) * limit;

      const organization = await prisma.organizations.findUnique({
        where: {
          organization_id,
        },
      });
      if (!organization) {
        return res.status(401).json({ message: "organization doesnt exists" });
      }

      const activeAlertCount = await prisma.alerts.count({
        where: { organization_id, status: "active" },
      });

      const alertHistoryCount = await prisma.alerts.count({
        where: { organization_id },
      });

      const scheduledAlertCount = await prisma.alerts.count({
        where: { organization_id, scheduled_time: { gt: new Date() } },
      });

      const totalDeliveries = await prisma.notification_Recipients.count({
        where: { alert: { organization_id } },
      });
      const deliveredCount = await prisma.notification_Recipients.count({
        where: { alert: { organization_id }, delivery_status: "delivered" },
      });
      const deliveryAverage = totalDeliveries
        ? (deliveredCount / totalDeliveries) * 100
        : 0;

      const alertListWhereClause = { organization_id };

      if (filter === "active") {
        alertListWhereClause.status = "active";
      } else if (filter === "scheduled") {
        alertListWhereClause.scheduled_time = { gt: new Date() };
      } else if (filter === "history") {
        alertListWhereClause.OR = [{ status: "resolved" }, { status: "ended" }];
      }

      const totalAlerts = await prisma.alerts.count({
        where: alertListWhereClause,
      });

      const alertDetails = await prisma.alerts.findMany({
        where: alertListWhereClause,
        skip,
        take: limit,
        orderBy: { start_time: "desc" },
        // 👇 SELECT statement updated to include the requested fields
        select: {
          id: true,
          message: true, // Alert Name / Alert Message
          severity: true, // Priority
          status: true, // Status
          emergency_type: {
            // Alert Type
            select: { name: true },
          },
          Alert_Sites: {
            // Site Name
            select: {
              site: {
                select: { name: true },
              },
            },
          },
          Alert_Areas: {
            // Area Name
            select: {
              area: {
                select: { name: true },
              },
            },
          },
        },
      });

      const safeCount = await prisma.notification_Recipients.count({
        where: { alert: { organization_id }, response: "safe" },
      });
      const needHelpCount = await prisma.notification_Recipients.count({
        where: { alert: { organization_id }, response: "not_safe" },
      });
      const notRespondedCount = await prisma.notification_Recipients.count({
        where: { alert: { organization_id }, response: null },
      });

      const totalEmployees = await prisma.users.count({
        where: { organization_id },
      });
      const deliveryStatusCounts = await prisma.notification_Recipients.groupBy(
        {
          by: ["delivery_status"],
          where: { alert: { organization_id } },
          _count: { delivery_status: true },
        }
      );

      res.json({
        active_alerts: activeAlertCount,
        alert_history: alertHistoryCount,
        scheduled_alerts: scheduledAlertCount,
        delivery_average: deliveryAverage,
        alerts: alertDetails,
        employee_status: {
          safe: safeCount,
          need_help: needHelpCount,
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
      });
    } catch (error) {
      console.error("Error fetching alert dashboard:", error);
      res.status(500).json({ error: "Error fetching alert dashboard" });
    }
  },

  getDashboardStats: async (req, res) => {
    try {
      const { organization_id } = req.query;

      if (!organization_id) {
        return res.status(400).json({
          error: "Bad Request",
          message: "organization_id query parameter is required.",
        });
      }

      const [
        active_count,
        scheduled_count,
        history_count,
        total_recipients,
        delivered_recipients,
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

      const delivery_rate =
        total_recipients > 0
          ? (delivered_recipients / total_recipients) * 100
          : 0;

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
        message: "An error occurred while fetching dashboard statistics.",
      });
    }
  },
  /**
   * @description Get comprehensive report data for an organization.
   * @route GET /api/v1/alert/get_reports
   */
  // detailed tab
  // get alert types
  getAlertTypes: async (req, res) => {
    try {
      const { organization_id } = req.query;
      const organization = await prisma.organizations.findUnique({
        where: {
          organization_id,
        },
      });
      if (!organization) {
        return res.status(401).json({ message: "organization doesnt exists" });
      }
      const alert_types = await prisma.emergency_Types.findMany({
        where: {
          organization_id,
        },
        select: {
          id: true,
          organization_id: true,
          name: true,
        },
      });
      console.log(alert_types);
      return res.json({ alert_types });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  },

  // targeting
  getSites: async (req, res) => {
    try {
      const { organization_id } = req.query;

      // check if organization exists
      const organization = await prisma.organizations.findUnique({
        where: {
          organization_id,
        },
      });
      if (!organization) {
        return res.status(401).json({ message: "organization doesnt exists" });
      }

      // find sites

      const sites = await prisma.sites.findMany({ where: { organization_id } });
      return res.json({ sites });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  },
  getAreas: async (req, res) => {
    try {
      const { organization_id, site_id } = req.query;

      // check if organization exists
      const organization = await prisma.organizations.findUnique({
        where: {
          organization_id,
        },
      });
      if (!organization) {
        return res.status(401).json({ message: "organization doesnt exists" });
      }
      const site = await prisma.sites.findUnique({
        where: {
          id: site_id,
        },
      });
      if (!site) {
        return res.status(401).json({ message: "site doesnt exists" });
      }
      const areas = await prisma.areas.findMany({ where: { site_id } });
      return res.json({ areas });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Something went wrong" });
    }
  },

  getRecipientCountsByArea: async (req, res) => {
    try {
      // UPDATED: Reading from req.body instead of req.query
      const { organization_id, area_ids } = req.body;

      // 1. Basic Input Validation
      if (!organization_id || !area_ids) {
        return res
          .status(400)
          .json({
            message:
              "organization_id and area_ids are required in the request body.",
          });
      }

      // UPDATED: Validate that area_ids is a non-empty array
      if (!Array.isArray(area_ids) || area_ids.length === 0) {
        return res
          .status(400)
          .json({ message: "area_ids must be a non-empty array." });
      }
      const areaIdArray = area_ids; // It's already an array

      // 2. Check if the Organization exists
      const organization = await prisma.organizations.findUnique({
        where: { organization_id },
        select: { organization_id: true },
      });

      if (!organization) {
        return res.status(404).json({ message: "Organization not found." });
      }

      // 3. Validate that ALL provided area_ids exist and belong to the organization
      const validAreas = await prisma.areas.findMany({
        where: {
          id: { in: areaIdArray },
          site: {
            organization_id: organization_id,
          },
        },
        select: { id: true },
      });

      if (validAreas.length !== areaIdArray.length) {
        const validAreaIdSet = new Set(validAreas.map((a) => a.id));
        const invalidIds = areaIdArray.filter((id) => !validAreaIdSet.has(id));
        return res.status(400).json({
          message:
            "One or more area IDs are invalid or do not belong to the specified organization.",
          invalid_ids: invalidIds,
        });
      }

      // 4. Fetch user counts for the validated areas in parallel
      const [employee_count, contractor_count] = await Promise.all([
        prisma.users.count({
          where: {
            area_id: { in: areaIdArray },
            user_type: "employee",
            is_active: true,
          },
        }),
        prisma.users.count({
          where: {
            area_id: { in: areaIdArray },
            user_type: "contractor",
            is_active: true,
          },
        }),
      ]);

      const total_recipients = employee_count + contractor_count;

      // 5. Send the successful response
      return res.status(200).json({
        employee_count,
        contractor_count,
        total_recipients,
      });
    } catch (error) {
      console.error("getRecipientCountsByArea error:", error);
      logger.error("getRecipientCountsByArea error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  createAlert: async (req, res) => {
    try {
      const validation = createAlertSchema.safeParse(req.body);
      if (!validation.success) {
        console.log(req.body);
        console.log(validation.error);
        return res
          .status(400)
          .json({
            message: "Invalid input",
            errors: validation.error.flatten(),
          });
      }
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
      } = validation.data;

      const [user, organization, emergencyType] = await Promise.all([
        prisma.users.findUnique({ where: { user_id } }),
        prisma.organizations.findUnique({ where: { organization_id } }),
        prisma.emergency_Types.findFirst({
          where: { name: alert_type, organization_id },
        }),
      ]);

      if (!user) return res.status(404).json({ message: "User not found." });
      if (!organization)
        return res.status(404).json({ message: "Organization not found." });
      if (user.organization_id !== organization_id)
        return res
          .status(403)
          .json({
            message: "Forbidden: User does not belong to the organization.",
          });
      if (!emergencyType)
        return res
          .status(404)
          .json({
            message: `Alert type '${alert_type}' not found for this organization.`,
          });

      const incomingSiteIds = selected_area_details.site_selections.map(
        (s) => s.site_id
      );
      const validSitesCount = await prisma.sites.count({
        where: { id: { in: incomingSiteIds }, organization_id },
      });
      if (validSitesCount !== incomingSiteIds.length)
        return res
          .status(400)
          .json({
            message:
              "One or more site IDs are invalid or do not belong to the organization.",
          });

      let finalAreaIds = new Set();
      for (const selection of selected_area_details.site_selections) {
        const areas = await prisma.areas.findMany({
          where: {
            site_id: selection.site_id,
            id:
              selection.area_ids.length > 0
                ? { in: selection.area_ids }
                : undefined,
          },
          select: { id: true },
        });
        if (
          selection.area_ids.length > 0 &&
          areas.length !== selection.area_ids.length
        )
          return res
            .status(400)
            .json({
              message: `One or more area IDs are invalid for site '${selection.site_id}'.`,
            });
        areas.forEach((area) => finalAreaIds.add(area.id));
      }
      const finalAreaIdsArray = Array.from(finalAreaIds);
      if (finalAreaIdsArray.length === 0)
        return res
          .status(400)
          .json({ message: "No areas found to send alert to." });

      const { timing, scheduled_time: scheduledTimeStr } = timing_details;
      const status =
        timing === "send_now" ? AlertStatus.active : AlertStatus.scheduled;
      const start_time = timing === "send_now" ? new Date() : null;
      const scheduled_time =
        timing === "scheduled" ? new Date(scheduledTimeStr) : null;
      if (status === AlertStatus.scheduled && scheduled_time <= new Date())
        return res
          .status(400)
          .json({ message: "Scheduled time must be in the future." });

      const newAlert = await prisma.$transaction(async (tx) => {
        const createdAlert = await tx.alerts.create({
          data: {
            user_id,
            organization_id,
            emergency_type_id: emergencyType.id,
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

      if (newAlert.status === "active") {
        await notificationQueue.add("send-alert-notifications", {
          alert_id: newAlert.id,
          send_sms,
        });
        logger.info(`[API] Job added to queue for active alert ${newAlert.id}`);
      } else if (newAlert.status === "scheduled" && newAlert.scheduled_time) {
        const delay = newAlert.scheduled_time.getTime() - Date.now();
        if (delay > 0) {
          await notificationQueue.add(
            "send-alert-notifications",
            { alert_id: newAlert.id, send_sms },
            { delay }
          );
          logger.info(
            `[API] Job scheduled in queue for alert ${newAlert.id} with a delay of ${Math.round(delay / 1000)}s`
          );
        }
      }

      return res.status(201).json({
        message: `Alert has been successfully ${newAlert.status === "active" ? "queued for dispatch" : "scheduled"}.`,
        alert_id: newAlert.id,
        status: newAlert.status,
      });
    } catch (error) {
      logger.error("createAlert error:", { error });
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },

  /**
   * Resolves an active alert by updating its status to 'resolved' and setting an end time.
   * Requires organization_id, alert_id, and a resolution message in the request body.
   */
  resolveAlert: async (req, res) => {
    try {
      const { organization_id, alert_id, message } = req.body;

      // 1. Basic Input Validation
      if (!organization_id || !alert_id || !message) {
        return res.status(400).json({
          message:
            "organization_id, alert_id, and a resolution message are required in the request body.",
        });
      }

      // 2. Find the alert to validate its existence and ownership.
      const alert = await prisma.alerts.findUnique({
        where: { id: alert_id },
      });

      // 3. Perform Validation Checks
      if (!alert) {
        return res.status(404).json({ message: "Alert not found." });
      }

      // SECURITY CHECK: Ensure the alert belongs to the requesting organization.
      if (alert.organization_id !== organization_id) {
        return res
          .status(403)
          .json({
            message:
              "Forbidden: You do not have permission to resolve this alert.",
          });
      }

      // STATE CHECK: Ensure the alert is currently active.
      if (alert.status !== "active") {
        // Using direct string comparison for clarity
        return res.status(409).json({
          // 409 Conflict is appropriate for incorrect state
          message: `Cannot resolve an alert with status '${alert.status}'. Only active alerts can be resolved.`,
        });
      }

      // 4. Update the Alert in the database
      await prisma.alerts.update({
        where: { id: alert_id },
        data: {
          status: "resolved", // Set status to resolved
          end_time: new Date(), // Mark the time of resolution
          // Append the resolution message to the original message for a clear audit trail
          message: alert.message + `\n\n--- RESOLUTION ---\n${message}`,
        },
      });

      // 5. Send successful response
      return res
        .status(200)
        .json({ message: "Alert has been successfully resolved." });
    } catch (error) {
      // Assuming you have a logger utility available in this scope
      console.error("resolveAlert error:", error);
      // logger.error("resolveAlert error:", { error });
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
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

export default AlertController;
