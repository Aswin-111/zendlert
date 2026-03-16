import { SeverityLevel } from "@prisma/client";
import { z } from "zod";

const createAlertSchema = z.object({
  alert_type: z.string().trim().min(1, "Alert type is required."),
  severity_level: z.nativeEnum(SeverityLevel),
  alert_message: z.string().trim().min(1, "Alert message is required."),
  send_sms: z.boolean(),
  response_required: z.boolean(),
  timing_details: z
    .object({
      timing: z.enum(["send_now", "scheduled"]),
      scheduled_time: z.string().optional(),
    })
    .refine((data) => data.timing !== "scheduled" || data.scheduled_time, {
      message: "scheduled_time is required for scheduled alerts.",
      path: ["scheduled_time"],
    }),
  selected_area_details: z.object({
    site_selections: z
      .array(
        z.object({
          site_id: z.string().uuid("Invalid site ID format."),
          area_ids: z.array(z.string().uuid("Invalid area ID format.")),
        }),
      )
      .min(1, "At least one site must be selected."),
  }),
});

export default createAlertSchema;