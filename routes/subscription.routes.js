import express from "express";
import SubscriptionController from "../controllers/subscription.controller.js";
import verifyAdminAccess from "../middlewares/verifyAdminAccess.js";
const router = express.Router();
router.use(verifyAdminAccess);


router.get("/plans", SubscriptionController.getPlansWithCurrentPlan);
// 1. Create Subscription (Protected)
router.post("/create", SubscriptionController.createSubscription);
router.get("/manage", SubscriptionController.getSubscriptionDetails);
router.post("/cancel", SubscriptionController.cancelSubscription);
router.post("/billing-portal", SubscriptionController.getBillingPortalSession);
router.post("/preview", SubscriptionController.previewInvoice);

// Get details for Success Page
router.get("/status", SubscriptionController.getSubscriptionStatus);
// 2. Webhook (Public)
// IMPORTANT: Raw body parsing for this route is configured centrally in app.js.
router.post("/webhook", SubscriptionController.handleWebhook);

export default router;
