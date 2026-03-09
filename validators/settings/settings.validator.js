import { z } from "zod";

const nonEmptyId = z.string().trim().min(1).max(128);
const nonEmptyName = z.string().trim().min(1).max(120);
const optionalDescription = z.string().trim().max(2000).optional();
const optionalNullableDescription = z.string().trim().max(2000).optional().nullable();

const optionalPagination = {
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

export const organizationIdQuerySchema = z.object({
  organization_id: nonEmptyId,
});

export const alertTypeListQuerySchema = organizationIdQuerySchema.extend({
  ...optionalPagination,
});

export const alertTypeMutationQuerySchema = z.object({
  organization_id: nonEmptyId,
  alert_type_id: nonEmptyId,
});

export const createAlertTypeBodySchema = z.object({
  organization_id: nonEmptyId,
  name: nonEmptyName,
  description: optionalDescription,
});

export const updateAlertTypeBodySchema = z.object({
  name: nonEmptyName.optional(),
  description: optionalNullableDescription,
});

export const createSeverityLevelBodySchema = z.object({
  organization_id: nonEmptyId,
  severity_name: nonEmptyName,
  description: optionalDescription,
});

export const severityLevelListQuerySchema = organizationIdQuerySchema.extend({
  ...optionalPagination,
});

export const editSeverityLevelBodySchema = z.object({
  organization_id: nonEmptyId,
  id: nonEmptyId,
  severity_name: nonEmptyName.optional(),
  description: optionalNullableDescription,
});

export const deleteSeverityLevelQuerySchema = z.object({
  organization_id: nonEmptyId,
  id: nonEmptyId,
});
