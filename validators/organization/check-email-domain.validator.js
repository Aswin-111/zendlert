import { z } from "zod";

const checkEmailDomainInputSchema = z.object({
  email: z.string().min(1),
});

export const parseCheckEmailDomainInput = (payload) => {
  const parsed = checkEmailDomainInputSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return { success: false, message: "Email is required." };
  }

  const email = parsed.data.email;
  if (!email.includes("@")) {
    return { success: false, message: "Email must contain '@'." };
  }

  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || domain.length < 3) {
    return { success: false, message: "Invalid email domain." };
  }

  return { success: true, email, domain };
};

export default checkEmailDomainInputSchema;

