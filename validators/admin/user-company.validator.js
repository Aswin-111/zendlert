import { z } from "zod";
// Helpers
const emptyToUndefined = (val) => {
  if (val === null) return undefined;
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
};


export const reportNotificationBodySchema = z.object({
  user_id: z.string().min(1),
});

export const editContractingCompanyParamsSchema = z.object({
  companyId: z
    .string({
      required_error: "company_id is required",
      invalid_type_error: "company_id is required",
    })
    .uuid("Invalid company_id"),
});

export const editContractingCompanyBodySchema = z.object({
  name: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "Company name cannot be empty").optional()
  ),

  contact_email: z.preprocess(
    emptyToUndefined,
    z.string().trim().email("Email is in invalid format").optional()
  ),

  phone: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "Phone cannot be empty").optional()
  ),

  address: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "Address cannot be empty").optional()
  ),
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

