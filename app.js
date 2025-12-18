// app.js
import express from "express";
import cors from "cors";

import organizationRoutes from "./routes/organization.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import userRoutes from "./routes/user.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import subscriptionsRoutes from "./routes/subscription.routes.js";
import configRoutes from "./routes/config.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

import { SubscriptionsController } from "./controllers/subscription.controller.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://192.168.1.6:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

// 1️⃣ RAW BODY WEBHOOK ROUTE — MUST BE FIRST
app.post(
  "/subscriptions/webhook",
  express.raw({ type: "application/json" }),
  SubscriptionsController.webhookHandler
);

// 2️⃣ Normal body parser AFTER webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug route
app.use("/test", (req, res) => {
  res.send("qwert");
});

// Routes
app.use("/config", configRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/alert", alertRoutes);
app.use("/api/v1/employee", employeeRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/analytics", analyticsRoutes);

// ❗ Correct subscription route
app.use("/api/v1/subscriptions", subscriptionsRoutes);

export default app;
