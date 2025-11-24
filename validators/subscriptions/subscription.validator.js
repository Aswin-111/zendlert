// validations/subscriptions.validation.js
import { z } from "zod";

export const createCustomerSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).optional(),
});

export const createSubscriptionSchema = z.object({
    organization_id: z.string().uuid(),
    subscription_plan_id: z.string().uuid(),
    stripe_customer_id: z.string().min(1),
    stripe_price_id: z.string().min(1),
    auto_renew: z.boolean().optional(),
});

export const invoicePreviewSchema = z.object({
    customer_id: z.string().min(1),
    price_id: z.string().min(1),
});

export const cancelSubscriptionSchema = z.object({
    stripe_subscription_id: z.string().min(1),
});

export const updateSubscriptionSchema = z.object({
    stripe_subscription_id: z.string().min(1),
    new_price_id: z.string().min(1),
});

export const listSubscriptionsSchema = z.object({
    organization_id: z.string().uuid().optional(), // optional filter
});
