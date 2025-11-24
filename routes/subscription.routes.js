import express from "express";
import { SubscriptionsController } from "../controllers/subscriptions.controller.js";
import { validate } from "../middlewares/validate.js";
import {
    createCustomerSchema,
    createSubscriptionSchema,
    invoicePreviewSchema,
    cancelSubscriptionSchema,
    updateSubscriptionSchema,
    listSubscriptionsSchema,
} from "../validators/subscriptions/subscription.validator.js"

const router = express.Router();

// POST /subscriptions/create-customer
router.post(
    "/create-customer",
    validate(createCustomerSchema),
    SubscriptionsController.createCustomer
);

// POST /subscriptions/create-subscription
router.post(
    "/create-subscription",
    validate(createSubscriptionSchema),
    SubscriptionsController.createSubscription
);

// POST /subscriptions/invoice-preview
router.post(
    "/invoice-preview",
    validate(invoicePreviewSchema),
    SubscriptionsController.invoicePreview
);

// POST /subscriptions/cancel-subscription
router.post(
    "/cancel-subscription",
    validate(cancelSubscriptionSchema),
    SubscriptionsController.cancelSubscription
);

// POST /subscriptions/update-subscription
router.post(
    "/update-subscription",
    validate(updateSubscriptionSchema),
    SubscriptionsController.updateSubscription
);

// GET /subscriptions?organization_id=...
router.get(
    "/",
    validate(listSubscriptionsSchema, "query"),
    SubscriptionsController.listSubscriptions
);



export default router;
