// utils/token.utils.js
import jwt from "jsonwebtoken";

export const generateTokens = (user) => {
  const payload = {
    user_id: user.user_id,
    email: user.email,
    role: user.role?.role_name,
    organization_id: user.organization_id,
    organization_name: user.organization?.name,
  };

  const accessToken = jwt.sign(
    payload,
    process.env.ACCESS_TOKEN_SECRET, // Use distinct secrets!
    { expiresIn: "15m" }, // Short life
  );

  const refreshToken = jwt.sign(
    { user_id: user.user_id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }, // Long life
  );

  return { accessToken, refreshToken };
};

export const sendRefreshTokenCookie = (res, token) => {
  res.cookie("jwt", token, {
    httpOnly: true, // Prevents JS access (XSS protection)
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: "strict", // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};
