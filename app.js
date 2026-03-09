// app.js
import express from "express";
import cors from "cors";
import { createRequire } from "module";
import logger, { requestLogMeta } from "./utils/logger.js";
import requestIdMiddleware from "./middlewares/requestId.js";
import notFoundHandler from "./middlewares/notFound.js";
import errorHandler from "./middlewares/errorHandler.js";
import attachAuthContext from "./middlewares/attachAuthContext.js";

import organizationRoutes from "./routes/organization.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import authRoutes from "./routes/auth.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import userRoutes from "./routes/user.routes.js";
import settingsRoutes from "./routes/settings.routes.js";

import subscriptionsRoutes from "./routes/subscription.routes.js";
import plansRoutes from "./routes/plan.routes.js";
import configRoutes from "./routes/config.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();
const bodyLimit = process.env.BODY_LIMIT || "1mb";
const require = createRequire(import.meta.url);

const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const wildcardCorsEnabled = configuredOrigins.includes("*");
const explicitCorsOrigins = configuredOrigins.filter((origin) => origin !== "*");
const allowAllCorsOrigins = wildcardCorsEnabled;
const hasExplicitCorsOrigins = explicitCorsOrigins.length > 0;
const corsMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
const corsAllowedHeaders = (
  process.env.CORS_ALLOWED_HEADERS
    || "Authorization,Content-Type,Accept,Origin,X-Requested-With,x-request-id"
)
  .split(",")
  .map((header) => header.trim())
  .filter(Boolean);
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const authRateLimitWindowMs = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const authRateLimitMaxRequests = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_MAX,
  10,
);
const authRateLimitedPaths = [
  "/api/v1/auth/otp/requests",
  "/api/v1/auth/otp/verifications",
  "/api/v1/auth/sessions/otp",
  "/api/v1/auth/employees/otp/requests",
  "/api/v1/auth/employees/otp/verifications",
  "/api/v1/auth/tokens/refresh",
  "/api/v1/auth/sessions/password",
];

const createIpRateLimiter = ({ windowMs, maxRequests }) => {
  const hits = new Map();

  const pruneExpiredEntries = () => {
    const now = Date.now();
    for (const [key, value] of hits.entries()) {
      if (value.expiresAt <= now) {
        hits.delete(key);
      }
    }
  };

  const cleanupTimer = setInterval(pruneExpiredEntries, windowMs);
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  return (req, res, next) => {
    if (req.method !== "POST") {
      return next();
    }

    const now = Date.now();
    const clientKey = `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.path}`;
    const current = hits.get(clientKey);

    if (!current || current.expiresAt <= now) {
      hits.set(clientKey, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    current.count += 1;
    hits.set(clientKey, current);

    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.expiresAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));

      logger.warn(
        "security.auth_rate_limited",
        requestLogMeta(req, res, {
          retryAfterSeconds,
        }),
      );

      return res.status(429).json({ message: "Too many requests" });
    }

    return next();
  };
};

let helmetMiddleware;
try {
  const helmetModule = require("helmet");
  helmetMiddleware = helmetModule.default || helmetModule;
} catch {
  helmetMiddleware = null;
}

app.disable("x-powered-by");

if (helmetMiddleware) {
  app.use(
    helmetMiddleware({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
} else {
  logger.warn("security.helmet_unavailable");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
}

if (allowAllCorsOrigins) {
  logger.warn("security.cors_wildcard_enabled", {
    credentials: false,
  });
} else if (!hasExplicitCorsOrigins) {
  logger.warn("security.cors_no_allowed_origins_configured");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowAllCorsOrigins || explicitCorsOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn("security.cors_origin_rejected", { origin });
      return callback(new Error("CORS origin denied"));
    },
    methods: corsMethods,
    allowedHeaders: corsAllowedHeaders,
    exposedHeaders: ["x-request-id"],
    credentials: hasExplicitCorsOrigins && !allowAllCorsOrigins,
    maxAge: 600,
    optionsSuccessStatus: 204,
  }),
);

app.use(requestIdMiddleware);

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.use(
  authRateLimitedPaths,
  createIpRateLimiter({
    windowMs: authRateLimitWindowMs,
    maxRequests: authRateLimitMaxRequests,
  }),
);

// Debug route
app.use("/test", (req, res) => {
  res.send("qwert");
});

// Use raw parser ONLY for the webhook route
app.use(
  "/api/v1/subscriptions/webhook",
  express.raw({ type: "application/json", limit: bodyLimit }),
);

// Routes
app.use("/api/v1/config", attachAuthContext, configRoutes);
app.use("/api/v1/auth", authRoutes);
app.use(
  "/api/v1/organizations",
  attachAuthContext,
  (req, res, next) => {
    logger.debug("request.organizations_route", requestLogMeta(req, res));
    next();
  },
  organizationRoutes,
);
app.use("/api/v1/users", attachAuthContext, userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/alert", alertRoutes);
app.use("/api/v1/employees", attachAuthContext, employeeRoutes);
app.use("/api/v1/settings", attachAuthContext, settingsRoutes);
app.use("/api/v1/analytics", analyticsRoutes);

app.use("/api/v1/subscriptions", attachAuthContext, subscriptionsRoutes);
app.use("/api/v1/plans", attachAuthContext, plansRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
