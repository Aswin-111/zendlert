export const AUTH_RESPONSE_MESSAGES = {
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN_INVALID_TOKEN: "Forbidden: Invalid Token",
  FORBIDDEN_EXPIRED_TOKEN: "Forbidden: Token Expired",
  FORBIDDEN_ADMIN_ONLY: "Forbidden: Access is denied. Admins only.",
  FORBIDDEN_EMPLOYEE_ONLY: "Forbidden: Access is denied. Employees only.",
  FORBIDDEN: "Forbidden",
};

const canWriteResponse = (res) =>
  Boolean(res && typeof res.status === "function" && typeof res.json === "function");

export const sendUnauthorized = (
  res,
  message = AUTH_RESPONSE_MESSAGES.UNAUTHORIZED,
) => {
  if (!canWriteResponse(res)) return;
  return res.status(401).json({ message });
};

export const sendForbidden = (
  res,
  message = AUTH_RESPONSE_MESSAGES.FORBIDDEN,
) => {
  if (!canWriteResponse(res)) return;
  return res.status(403).json({ message });
};
