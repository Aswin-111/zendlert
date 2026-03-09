import { z } from "zod";

const phoneRegex = /^\+?[1-9]\d{7,14}$/;

export const areaInputSchema = z.object({
  name: z.string().trim().min(1, "area name is required").max(255),
  description: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
});

export const createSiteSchema = z.object({
  site_name: z.string().trim().min(1, "site_name is required").max(255),
  address: z.string().trim().min(1, "address is required"),
  address_line_2: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  city: z.string().trim().min(1, "city is required"),
  state: z.string().trim().min(1, "state is required"),
  zipcode: z.string().trim().min(3).max(12),
  site_contact_name: z
    .string()
    .trim()
    .min(1, "site_contact_name is required"),
  contact_email: z.string().email().transform((value) => value.toLowerCase()),
  contact_phone: z
    .string()
    .trim()
    .regex(phoneRegex, "contact_phone must be a valid phone number")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
});

export const updateSiteSchema = z.object({
  site_name: z.string().trim().min(1).max(255).optional(),
  address: z.string().trim().min(1).optional(),
  address_line_2: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  zipcode: z.string().trim().min(3).max(12).optional(),
  site_contact_name: z.string().trim().min(1).optional(),
  contact_email: z
    .string()
    .email()
    .optional()
    .transform((value) => (value ? value.toLowerCase() : value)),
  contact_phone: z
    .string()
    .trim()
    .regex(phoneRegex, "contact_phone must be a valid phone number")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  is_active: z.boolean().optional(),
  areas: z.array(areaInputSchema).optional(),
});

export const createAreaSchema = z.object({
  name: z.string().trim().min(1, "Area name is required").max(255),
  site_id: z.string().uuid("site_id must be a valid UUID"),
  description: z
    .string()
    .trim()
    .max(1000, "Description too long")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
});

export const updateAreaSchema = z.object({
  name: z.string().trim().min(1, "Area name is required").max(255).optional(),
  description: z
    .string()
    .trim()
    .max(1000, "Description too long")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  site_id: z.string().uuid("site_id must be a valid UUID").optional(),
});

export const siteIdParamSchema = z.string().uuid("site id must be a valid UUID");
export const areaIdParamSchema = z.string().uuid("area id must be a valid UUID");
export const alertIdParamSchema = z.string().uuid();
