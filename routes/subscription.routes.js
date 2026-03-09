import express from "express";
import SubscriptionController from "../controllers/subscription.controller.js";

const router = express.Router();

// 1. Create Subscription (Protected)
router.post("/create", SubscriptionController.createSubscription);
router.post("/preview", SubscriptionController.previewInvoice);

// Get details for Success Page
router.get("/status", SubscriptionController.getSubscriptionStatus);
// 2. Webhook (Public)
// IMPORTANT: Raw body parsing for this route is configured centrally in app.js.
router.post("/webhook", SubscriptionController.handleWebhook);

export default router;
