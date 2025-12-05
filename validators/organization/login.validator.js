import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
});

export default loginSchema;
