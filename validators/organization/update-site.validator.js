import z from "zod";

// Validator for Site Update
const updateSiteSchema = z.object({
  site_id: z.string({ required_error: "Site ID is required" }),
  name: z.string().min(1, "Site name is required").optional(),
  address_line_1: z.string().optional(),
  address_line_2: z.string().optional().nullable(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().nullable(),
  contact_phone: z.string().optional().nullable(),
});

export default updateSiteSchema;
