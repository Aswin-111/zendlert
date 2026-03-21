import { z } from "zod";

export const reportVisitorSchema = z.object({
  first_name: z.string().trim().min(1, "first_name is required").max(100),
  last_name: z.string().trim().max(100).optional().default(""),
  company_name: z.string().trim().min(1, "company_name is required").max(255),
  contact_number: z
    .string()
    .trim()
    .min(8, "contact_number is too short")
    .max(20)
    .optional(),
  location: z.string().trim().min(1, "location is required").max(255),
  visiting_purpose: z
    .string()
    .trim()
    .min(1, "visiting_purpose is required")
    .max(1000),
  alert_id: z.string().uuid("alert_id must be a valid UUID"),
});

export const buildRespondToAlertSchema = (allowedResponses) =>
  z.object({
    alert_id: z.string().uuid("alert_id must be a valid UUID"),
    response: z.enum(allowedResponses, {
      errorMap: () => ({ message: "Invalid response value" }),
    }),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    location_name: z.string().trim().max(255).optional(),
  }).superRefine((data, ctx) => {
    const hasLatitude = data.latitude !== undefined;
    const hasLongitude = data.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitude and longitude must be provided together",
        path: hasLatitude ? ["longitude"] : ["latitude"],
      });
    }
  });

export const listLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const toggleNotificationSchema = z.object({
  enabled: z.coerce.boolean().optional(),
});

export const updateProfileBodySchema = z
  .object({
    full_name: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.full_name || data.email || data.phone, {
    message: "At least one field is required to update",
  });
