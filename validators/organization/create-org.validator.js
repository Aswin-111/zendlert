import { z } from "zod";

const createAccountSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format"),

  full_name: z
    .string({ required_error: "Full name is required" })
    .min(3, "Full name must be at least 3 characters"),

  organization_name: z
    .string({ required_error: "Organization name is required" })
    .min(2, "Organization name must be at least 2 characters"),

  time_zone: z.string({ required_error: "Time zone is required" }).optional(), // OR .default("UTC")
});

export default createAccountSchema;
