import { randomUUID } from "crypto";
import logger, { requestLogMeta } from "../utils/logger.js";

export default function requestIdMiddleware(req, res, next) {
  const incomingRequestId = req.get("x-request-id");
  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim().slice(0, 128)
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startedAt = process.hrtime.bigint();
  logger.info("request.start", requestLogMeta(req, res));

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      "request.finish",
      requestLogMeta(req, res, { durationMs: Number(durationMs.toFixed(2)) }),
    );
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      logger.warn("request.aborted", requestLogMeta(req, res));
    }
  });

  return next();
}

