import { z } from "zod";

export const reportNotificationBodySchema = z.object({
  user_id: z.string().min(1),
});

export const editContractingCompanyParamsSchema = z.object({
  companyId: z.string().min(1),
});

export const editContractingCompanyBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  contact_email: z.string().email().optional(),
  phone: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
});

export const siteAlertsBodySchema = z.object({
  building_name: z.string().trim().min(1),
});

export const toggleEmployeeStatusParamsSchema = z.object({
  userId: z.string().min(1),
});

export const toggleEmployeeStatusBodySchema = z.object({
  status: z.enum(["activate", "deactivate"]),
});

export const companyIdParamSchema = z.object({
  companyId: z.string().min(1),
});

