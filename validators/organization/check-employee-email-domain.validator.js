import { z } from "zod";

const checkEmployeeEmailDomainSchema = z.object({
  domain: z
    .string()
    .email()
    .transform((value) => value.split("@")[1])
    .refine((value) => !!value, {
      message: "Invalid email format. Must include a domain.",
    }),
});

export default checkEmployeeEmailDomainSchema;
