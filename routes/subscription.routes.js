import express from "express";
import SubscriptionController from "../controllers/subscription.controller.js";
import verifyJWT from "../middlewares/verifyJWT.js";

const router = express.Router();

// 1. Create Subscription (Protected)
router.post("/create", verifyJWT, SubscriptionController.createSubscription);
router.post("/preview", verifyJWT, SubscriptionController.previewInvoice);
// 2. Webhook (Public)
// IMPORTANT: The raw body parsing must be handled in your server.js (app.js)
// before this route is mounted, or via specific middleware here if your setup supports it.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  SubscriptionController.handleWebhook,
);

export default router;
