import jwt from "jsonwebtoken";
import logger from "./logger.js";
import { parseBearerToken } from "./token.js";

function getMetadataValue(call, key) {
    const values = call?.metadata?.get?.(key);

    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const value = values[0];

    if (Buffer.isBuffer(value)) {
        return value.toString("utf8");
    }

    return typeof value === "string" ? value : String(value);
}

function buildGrpcRequestMeta(call) {
    return {
        service: "subscription.grpc",
        method: call?.call?.handler?.path || "unknown",
    };
}

export function getAuthContext(call) {
    const requestMeta = buildGrpcRequestMeta(call);

    const header =
        getMetadataValue(call, "authorization") ||
        getMetadataValue(call, "Authorization");

    const token = parseBearerToken(header);

    if (!token) {
        logger.warn("auth.grpc.missing_or_invalid_bearer", {
            ...requestMeta,
        });

        const error = new Error("Unauthorized");
        error.code = 16; // grpc.status.UNAUTHENTICATED
        throw error;
    }

    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;

    if (typeof accessTokenSecret !== "string" || !accessTokenSecret.trim()) {
        logger.error("auth.grpc.secret_missing", {
            ...requestMeta,
        });

        const error = new Error("Forbidden: Invalid Token");
        error.code = 7; // grpc.status.PERMISSION_DENIED
        throw error;
    }

    try {
        const decoded = jwt.verify(token, accessTokenSecret);

        if (!decoded || typeof decoded !== "object") {
            logger.warn("auth.grpc.invalid_token_payload", {
                ...requestMeta,
            });

            const error = new Error("Forbidden: Invalid Token");
            error.code = 7; // grpc.status.PERMISSION_DENIED
            throw error;
        }

        return decoded;
    } catch (err) {
        const isExpired = err?.name === "TokenExpiredError";

        logger.warn("auth.grpc.verify_failed", {
            ...requestMeta,
            reason: isExpired ? "token_expired" : "invalid_token",
            errorName: err?.name || "UnknownError",
        });

        const error = new Error(
            isExpired ? "Forbidden: Token Expired" : "Forbidden: Invalid Token"
        );
        error.code = isExpired ? 16 : 7;
        throw error;
    }
}