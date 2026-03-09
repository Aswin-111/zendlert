import { z } from "zod";

const hasValidDomainPart = (email) =>
  typeof email === "string" &&
  email.includes("@") &&
  email.split("@")[1]?.trim().length >= 3;

export const otpEmailSchema = z.object({
  email: z.string().refine(hasValidDomainPart),
});

export const otpPurposeSchema = z.object({
  purpose: z.enum(["ORG_VERIFY", "LOGIN"]),
});

export const verifyOtpRequiredSchema = z.object({
  email: z.string().min(1),
  otp: z.string().min(1),
  purpose: z.string().min(1),
});

export const verifyEmployeeOtpRequiredSchema = z.object({
  email: z.string().min(1),
  otp: z.string().min(1),
});
