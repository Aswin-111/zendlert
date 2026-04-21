import logger from "./logger.js";

const RESEND_API_URL =
    process.env.RESEND_EMAIL_BASE_URL || "https://api.resend.com/emails";

export async function sendEmailVerificationCode({ to, code, subject }) {
    const resendKey = process.env.RESEND_KEY;
    const fromEmail = process.env.FROM_EMAIL;

    if (!resendKey || !fromEmail) {
        throw new Error("Missing RESEND_KEY or FROM_EMAIL");
    }

    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">
        ${code}
      </div>
      <p>This code will expire in 10 minutes.</p>
    </div>
  `;

    const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [to],
            subject: subject || "Verify your email",
            html,
        }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        logger.error("sendEmailVerificationCode.failed", {
            status: response.status,
            data,
        });
        throw new Error(data?.message || "Failed to send verification email");
    }

    return data;
}