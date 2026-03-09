import { z } from "zod";

const createContractingCompanySchema = z.object({
  name: z.string({ required_error: "Company name is required" }),
  address: z.string({ required_error: "Company address is required" }),
  contact_email: z
    .string({ required_error: "Email is required" })
    .email({ message: "Email is in invalid format" }),
  phone: z.string({ required_error: "Phone number is required" }),
});

export default createContractingCompanySchema;
