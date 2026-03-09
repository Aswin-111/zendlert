import { z } from "zod";

const loginOtpSchema = z.object({
  email: z.string().min(1),
  otp: z.string().min(1),
});

export default loginOtpSchema;

