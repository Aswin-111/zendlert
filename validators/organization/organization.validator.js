import { z } from "zod";

const organizationSchema = z.object({
  name: z.string().min(3, "Organization name is required"),
  email_domain: z
    .string()
    .email("Must be a valid email")
    .transform((val) => val.split("@")[1] || val),
  industry_type: z.string().min(2, "Industry type is required"),
});

export default organizationSchema;
