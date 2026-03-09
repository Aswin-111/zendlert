import logger from "../utils/logger.js";
import { toGrpcErrorCode } from "../helpers/grpc-error.helper.js";
import { getAlertDataPayload } from "../services/alert.service.js";

export async function getAlertData(call, callback, prisma) {
  try {
    const payload = await getAlertDataPayload(prisma, call.request?.alert_id);
    callback(null, payload);
  } catch (error) {
    logger.error("gRPC GetAlertData error", { error });
    if (error?.statusCode) {
      return callback({
        code: toGrpcErrorCode(error.statusCode),
        message: error.message,
      });
    }
    return callback({
      code: toGrpcErrorCode(),
      message: "An internal error occurred while fetching alert data.",
    });
  }
}
