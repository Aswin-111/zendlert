import jwt from "jsonwebtoken";
import { parseBearerToken } from "../utils/token.js";
import logger from "../utils/logger.js";

export default function attachAuthContext(req, res, next) {
  if (req?.user && typeof req.user === "object") {
    return next();
  }

  const header = req?.headers?.authorization || req?.headers?.Authorization;
  const token = parseBearerToken(header);
  if (!token) {
    return next();
  }

  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  if (typeof accessTokenSecret !== "string" || !accessTokenSecret.trim()) {
    logger.warn("auth.attach_context.secret_missing", {
      requestId: req?.requestId || null,
      path: req?.originalUrl || req?.url || null,
    });
    return next();
  }

  try {
    const decoded = jwt.verify(token, accessTokenSecret);
    if (decoded && typeof decoded === "object") {
      req.user = decoded;
    }
  } catch (err) {
    logger.warn("auth.attach_context.invalid_token", {
      requestId: req?.requestId || null,
      path: req?.originalUrl || req?.url || null,
      reason: err?.name || "InvalidToken",
    });
  }

  return next();
}

