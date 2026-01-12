import express from "express";
import SubscriptionsController from "../controllers/subscription.controller.js";

const router = express.Router();

// STEP 1 — Retrieve price for product
router.get("/stripe/product-price", SubscriptionsController.getPriceForProduct);
// STEP 2 — Create Stripe customer
router.post("/stripe/create-customer", SubscriptionsController.createCustomer);
// STEP 3 — Create payment method using token
router.post(
  "/stripe/payment-method",
  SubscriptionsController.createPaymentMethod
);
// STEP 4 — Attach payment method to customer
router.post(
  "/stripe/attach-payment-method",
  SubscriptionsController.attachPaymentMethodToCustomer
);

// STEP 5 — Create subscription
router.post(
  "/stripe/create-subscription",
  SubscriptionsController.createSubscription
);

// // CREATE CHECKOUT SESSION (Stripe Hosted UI)
// router.post(
//   "/stripe/create-checkout-session",
//   SubscriptionsController.createCheckoutSession
// );

export default router;
