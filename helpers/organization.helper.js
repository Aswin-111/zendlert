export const splitFullName = (fullName) => {
  const [firstName, ...rest] = String(fullName || "").trim().split(" ");
  return {
    firstName,
    lastName: rest.join(" ") || "",
  };
};

export const getOtpEmailTemplateByPurpose = (purpose, otp) => {
  if (purpose === "ORG_VERIFY") {
    return {
      subject: "OTP for Organization Verification",
      html: `
<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fc;">
  <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 8px;">
    <h2 style="color:#2c3e50;">Welcome to Emertify!</h2>
    <p>Use the OTP below to verify your organization:</p>
    <h1 style="letter-spacing:4px;">${otp}</h1>
    <p>This OTP is valid for <strong>10 minutes</strong>.</p>
  </div>
</div>
`,
    };
  }

  return {
    subject: "Your Login OTP",
    html: `
<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fc;">
  <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 8px;">
    <h2 style="color:#2c3e50;">Login to Emertify</h2>
    <p>Use the OTP below to login:</p>
    <h1 style="letter-spacing:4px;">${otp}</h1>
    <p>If you did not request this login, ignore this email.</p>
  </div>
</div>
`,
  };
};

export const getEmployeeVerificationOtpEmailTemplate = (otp) => ({
  subject: "OTP for Employee Verification",
  html: `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fc; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px;">
      <h2 style="color: #2c3e50;">Welcome to Emertify!</h2>
     
      <p style="font-size: 16px;">
        To complete your setup, please use the following OTP:
      </p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2c3e50; background-color: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 6px;">
        ${otp}
      </p>
      <p style="font-size: 14px; color: #777; margin-top: 20px;">
        This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
      </p>
      <hr style="margin: 30px 0;" />
      <p style="font-size: 14px; color: #999;">
        If you did not request this, please ignore this email.<br/>
        Need help? Contact support at <a href="mailto:support@yourcompany.com" style="color: #3498db;">support@yourcompany.com</a>.
      </p>
    </div>
  </div>
`,
});
