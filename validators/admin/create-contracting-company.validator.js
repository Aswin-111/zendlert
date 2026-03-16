import { z } from "zod";

const createContractingCompanySchema = z.object({
  name: z
    .string({ required_error: "Company name is required" })
    .trim()
    .min(1, "Company name is required"),

  address: z
    .string()
    .trim()
    .optional(),

  phone: z
    .string()
    .trim()
    .optional(),

  contact_email: z.preprocess(
    (val) => {
      if (typeof val === "string" && val.trim() === "") return undefined;
      return val;
    },
    z.string().email("Email is in invalid format").optional()
  ),
});

export default createContractingCompanySchema;