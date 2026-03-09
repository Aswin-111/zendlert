import logger, { requestLogMeta, serializeError } from "../utils/logger.js";
import { sendForbidden } from "./authResponse.js";

export default function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  logger.error(
    "request.error",
    requestLogMeta(req, res, {
      statusCode,
      error: serializeError(err),
    }),
  );

  if (res.headersSent) {
    return next(err);
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Payload too large" });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON payload" });
  }

  if (err?.message === "CORS origin denied") {
    return sendForbidden(res);
  }

  return res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : err?.message || "Request failed",
  });
}
