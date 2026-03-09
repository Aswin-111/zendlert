import { z } from "zod";

export const checkBusinessNameQuerySchema = z.object({
  business_name: z.string().min(1),
});

export const updateOrganizationBodySchema = z.object({
  organization_id: z.any().refine((value) => Boolean(value)),
  name: z.any().optional(),
  industry_type_id: z.any().optional(),
  main_contact_name: z.any().optional(),
  main_contact_email: z.any().optional(),
  main_contact_phone: z.any().optional(),
});

export const getOrganizationNameQuerySchema = z.object({
  user_id: z.string().min(1),
});

export const getAllSitesQuerySchema = z.object({
  organization_id: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
