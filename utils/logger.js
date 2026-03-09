// utils/logger.js
import winston from "winston";

const isProd = process.env.NODE_ENV === "production";
const RESERVED_LOG_KEYS = new Set([
    "level",
    "message",
    "timestamp",
    "stack",
]);
const SENSITIVE_KEY_PATTERN = /(authorization|password|passwd|pwd|secret|token|otp|cookie|api[-_]?key|private[-_]?key|client[-_]?secret|credential)/i;
const REDACTED = "[REDACTED]";
const MAX_REDACTION_DEPTH = 8;

function redactString(value) {
    if (typeof value !== "string") return value;

    let redactedValue = value;
    redactedValue = redactedValue.replace(
        /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
        "Bearer [REDACTED]"
    );
    redactedValue = redactedValue.replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g,
        "[REDACTED_JWT]"
    );
    redactedValue = redactedValue.replace(
        /(password|passwd|pwd)\s*[:=]\s*[^,\s]+/gi,
        "$1=[REDACTED]"
    );

    return redactedValue;
}

function redactValue(value, keyName = "", depth = 0, seen = new WeakSet()) {
    if (SENSITIVE_KEY_PATTERN.test(keyName)) {
        return REDACTED;
    }

    if (depth > MAX_REDACTION_DEPTH) {
        return "[Truncated]";
    }

    if (typeof value === "string") {
        return redactString(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item, keyName, depth + 1, seen));
    }

    if (value && typeof value === "object") {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);

        if (value instanceof Error) {
            return {
                name: value.name,
                message: redactString(value.message),
                stack: redactString(value.stack),
                code: value.code,
            };
        }

        const sanitizedObject = {};
        for (const [childKey, childValue] of Object.entries(value)) {
            sanitizedObject[childKey] = redactValue(
                childValue,
                childKey,
                depth + 1,
                seen
            );
        }
        return sanitizedObject;
    }

    return value;
}

export function serializeError(error) {
    if (!error) return undefined;
    if (error instanceof Error) {
        const serialized = {
            name: error.name,
            message: redactString(error.message),
            stack: redactString(error.stack),
        };
        if (error.code) serialized.code = error.code;
        return redactValue(serialized, "error");
    }
    return redactValue(error, "error");
}

export function requestLogMeta(req, res, extra = {}) {
    const requestId =
        req?.requestId
        || req?.id
        || req?.get?.("x-request-id")
        || res?.getHeader?.("x-request-id");

    return {
        requestId,
        method: req?.method,
        path: req?.originalUrl || req?.url,
        statusCode: res?.statusCode,
        ip: req?.ip,
        userAgent: req?.get?.("user-agent"),
        ...extra,
    };
}

// Helpful for structured error stacks
const enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        return {
            level: info.level || "error",
            message: redactString(info.message),
            error: serializeError(info),
        };
    }
    if (typeof info?.message === "string") {
        info.message = redactString(info.message);
    }
    if (info?.error) {
        info.error = serializeError(info.error);
    }
    return info;
});

const redactSensitiveFormat = winston.format((info) => {
    for (const [key, value] of Object.entries(info)) {
        info[key] = redactValue(value, key);
    }
    return info;
});

const consoleFormat = winston.format.combine(
    enumerateErrorFormat(),
    winston.format.splat(),
    redactSensitiveFormat(),
    winston.format.colorize({ all: !isProd }),
    winston.format.timestamp(),
    winston.format.printf((info) => {
        const base = `${info.timestamp} ${info.level}: ${info.message}`;
        const meta = {};
        for (const [key, value] of Object.entries(info)) {
            if (!RESERVED_LOG_KEYS.has(key)) {
                meta[key] = value;
            }
        }
        const metaSuffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        return `${base}${metaSuffix}`;
    })
);

const jsonFormat = winston.format.combine(
    enumerateErrorFormat(),
    winston.format.splat(),
    redactSensitiveFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// In containers: prefer console only (ship logs via Docker/K8s)
const transports = [
    new winston.transports.Console({
        format: isProd ? jsonFormat : consoleFormat,
    }),
];

// Only write to files if explicitly enabled (VM / bare metal)
if (process.env.LOG_TO_FILE === "true") {
    transports.push(
        new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
            format: jsonFormat,
        }),
        new winston.transports.File({
            filename: "logs/app.log",
            level: "info",
            format: jsonFormat,
        })
    );
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    defaultMeta: {
        service: process.env.SERVICE_NAME || "zendlert-api",
        env: process.env.NODE_ENV || "development",
    },
    transports,
    exitOnError: false,
});

export default logger;
