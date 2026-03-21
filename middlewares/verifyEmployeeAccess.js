import jwt from "jsonwebtoken";
import { parseBearerToken } from "../utils/token.js";
import logger from "../utils/logger.js";
import {
  AUTH_RESPONSE_MESSAGES,
  sendForbidden,
  sendUnauthorized,
} from "./authResponse.js";

const buildRequestMeta = (req) => ({
  requestId: req?.requestId || null,
  method: req?.method || null,
  path: req?.originalUrl || req?.url || null,
  ip: req?.ip || null,
  userAgent: typeof req?.get === "function" ? req.get("user-agent") : null,
});

export default function verifyEmployeeAccess(req, res, next) {
  if (!req || !res || typeof next !== "function") {
    logger.error("auth.verifyEmployeeAccess.invalid_arguments");
    return;
  }

  const requestMeta = buildRequestMeta(req);
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  const token = parseBearerToken(header);

  if (!token) {
    logger.warn(
      "auth.verifyEmployeeAccess.missing_or_invalid_bearer",
      requestMeta
    );
    return sendUnauthorized(res, AUTH_RESPONSE_MESSAGES.UNAUTHORIZED);
  }

  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  if (typeof accessTokenSecret !== "string" || !accessTokenSecret.trim()) {
    logger.error("auth.verifyEmployeeAccess.secret_missing", requestMeta);
    return sendForbidden(
      res,
      AUTH_RESPONSE_MESSAGES.FORBIDDEN_INVALID_TOKEN
    );
  }

  try {
    const decoded = jwt.verify(token, accessTokenSecret);

    if (!decoded || typeof decoded !== "object") {
      logger.warn("auth.verifyEmployeeAccess.invalid_token_payload", requestMeta);
      return sendForbidden(
        res,
        AUTH_RESPONSE_MESSAGES.FORBIDDEN_INVALID_TOKEN
      );
    }

    if (String(decoded?.role || "").toLowerCase() !== "employee") {
      logger.warn("auth.verifyEmployeeAccess.role_denied", {
        ...requestMeta,
        user_id: decoded?.user_id || null,
      });
      return sendForbidden(
        res,
        AUTH_RESPONSE_MESSAGES.FORBIDDEN_EMPLOYEE_ONLY
      );
    }

    req.user = decoded;
    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";

    logger.warn("auth.verifyEmployeeAccess.verify_failed", {
      ...requestMeta,
      reason: isExpired ? "token_expired" : "invalid_token",
      errorName: err?.name || "UnknownError",
    });

    return sendForbidden(
      res,
      isExpired
        ? AUTH_RESPONSE_MESSAGES.FORBIDDEN_EXPIRED_TOKEN
        : AUTH_RESPONSE_MESSAGES.FORBIDDEN_INVALID_TOKEN
    );
  }
}