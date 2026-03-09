import logger, { requestLogMeta } from "../utils/logger.js";

export default function notFoundHandler(req, res) {
  logger.warn("request.not_found", requestLogMeta(req, res, { statusCode: 404 }));
  return res.status(404).json({ message: "Not found" });
}

