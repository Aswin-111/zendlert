/**
 * Reads organization id from the authenticated user and returns 401 when absent.
 */
export function getOrganizationIdOrUnauthorized(req, res) {
  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return organizationId;
}

/**
 * Reads required auth context and returns 401 when any required field is missing.
 */
export function getUserAndOrganizationOrUnauthorized(req, res) {
  const userId = req.user?.user_id;
  const organizationId = req.user?.organization_id;
  if (!userId || !organizationId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return { userId, organizationId };
}

/**
 * Maps known service errors to HTTP responses while preserving existing payload shape.
 */
export function respondWithKnownServiceError(
  res,
  error,
  allowedCodes,
  extraPayloadByCode = {},
) {
  if (!allowedCodes.includes(error?.statusCode)) {
    return false;
  }

  const statusCode = error.statusCode;
  const basePayload = { message: error.message };
  const extras = extraPayloadByCode[statusCode];
  const extraPayload = typeof extras === "function" ? extras(error) : extras;

  res.status(statusCode).json({
    ...basePayload,
    ...(extraPayload || {}),
  });
  return true;
}
