import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Any of these statuses mean the org already has an in-flight/active subscription.
const NON_TERMINAL_STATUSES = ["active", "trialing", "past_due", "incomplete", "unpaid"];

/**
 * Resolve organization id safely.
 * - Prefer org from authenticated user context.
 * - If body org is provided and mismatched, reject for tenant safety.
 */
const resolveOrganizationId = (req) => {
  const bodyOrgId = req.body?.organization_id;
  const userOrgId = req.user?.organization_id;

  if (userOrgId && bodyOrgId && userOrgId !== bodyOrgId) {
    return { error: "Organization mismatch.", status: 403 };
  }

  const organizationId = userOrgId || bodyOrgId;
  if (!organizationId) {
    return { error: "Organization ID is required.", status: 400 };
  }

  return { organizationId };
};

/**
 * Fetch a plan and ensure it is billable in Stripe.
 */
const getPlanOrFail = async (planId) => {
  if (!planId) {
    return { error: "Plan ID is required.", status: 400 };
  }

  const plan = await prisma.subscription_Plans.findUnique({
    where: { id: planId },
  });

  if (!plan || !plan.stripe_price_id) {
    return { error: "Plan or Stripe Price ID not found.", status: 404 };
  }

  return { plan };
};

/**
 * Reuse existing Stripe customer for the org if available.
 * Otherwise create one using an idempotency key.
 */
const getOrCreateStripeCustomer = async ({
  organizationId,
  billingEmail,
  customerName,
  address,
  userId,
  idempotencyKeyPrefix,
}) => {
  const existingSub = await prisma.subscriptions.findFirst({
    where: { organization_id: organizationId, stripe_customer_id: { not: null } },
    orderBy: { created_at: "desc" },
    select: { stripe_customer_id: true },
  });

  if (existingSub?.stripe_customer_id) {
    return existingSub.stripe_customer_id;
  }

  const customer = await stripe.customers.create(
    {
      email: billingEmail,
      name: customerName || `Org: ${organizationId}`,
      metadata: { organization_id: organizationId, user_id: userId },
      address: address || undefined,
    },
    { idempotencyKey: `${idempotencyKeyPrefix}:customer:create` },
  );

  return customer.id;
};

/**
 * Convert Stripe epoch timestamps to JS Date values with a fallback window.
 */
const getPeriodDates = (subscription) => {
  const startTs = subscription.current_period_start;
  const endTs = subscription.current_period_end;

  return {
    periodStart: startTs ? new Date(startTs * 1000) : new Date(),
    periodEnd: endTs
      ? new Date(endTs * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
};

const SubscriptionController = {
  /**
   * Paid subscription flow:
   * 1) Validate org/plan/payment method
   * 2) Resolve Stripe customer
   * 3) Attach PM + create Stripe subscription
   * 4) Persist local row
   */
  createSubscription: async (req, res) => {
    try {
      const { plan_id, payment_method_id, customer_name, address } = req.body;
      const { user_id, email: billingEmail } = req.user;

      const orgCheck = resolveOrganizationId(req);
      if (orgCheck.error) {
        return res.status(orgCheck.status).json({ message: orgCheck.error });
      }
      const organizationId = orgCheck.organizationId;

      if (!payment_method_id) {
        return res.status(400).json({ message: "Payment Method ID is required." });
      }

      const planResult = await getPlanOrFail(plan_id);
      if (planResult.error) {
        return res.status(planResult.status).json({ message: planResult.error });
      }
      const plan = planResult.plan;

      // Prevent duplicate active/pending subscriptions for one org.
      const existingSub = await prisma.subscriptions.findFirst({
        where: {
          organization_id: organizationId,
          status: { in: NON_TERMINAL_STATUSES },
        },
        select: { id: true, status: true },
      });

      if (existingSub) {
        return res.status(409).json({
          message: `Organization already has a ${existingSub.status} subscription.`,
        });
      }

      // Stable idempotency base for Stripe write operations.
      const requestKeyBase = `org:${organizationId}:plan:${plan_id}:user:${user_id}`;

      const customerId = await getOrCreateStripeCustomer({
        organizationId,
        billingEmail,
        customerName: customer_name,
        address,
        userId: user_id,
        idempotencyKeyPrefix: requestKeyBase,
      });

      // Ensure PM is either unattached or already attached to this customer.
      const paymentMethod = await stripe.paymentMethods.retrieve(payment_method_id);
      if (paymentMethod.customer && paymentMethod.customer !== customerId) {
        return res.status(400).json({
          message: "Payment method is already attached to a different customer.",
        });
      }

      if (!paymentMethod.customer) {
        await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });
      }

      // Set default method so invoices/renewals use this PM.
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: payment_method_id },
      });

      // Create Stripe subscription in "incomplete" mode until payment confirmation finishes.
      const subscription = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: plan.stripe_price_id }],
          default_payment_method: payment_method_id,
          payment_behavior: "default_incomplete",
          expand: ["latest_invoice.payment_intent"],
          automatic_tax: { enabled: false },
          metadata: {
            organization_id: organizationId,
            plan_id,
            user_id,
          },
        },
        { idempotencyKey: `${requestKeyBase}:subscription:create` },
      );

      const status = subscription.status;
      const { periodStart, periodEnd } = getPeriodDates(subscription);

      let newDbSubscription;
      try {
        // Persist the local source-of-truth row.
        newDbSubscription = await prisma.subscriptions.create({
          data: {
            organization_id: organizationId,
            subscription_plan_id: plan_id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            stripe_price_id: plan.stripe_price_id,
            status,
            payment_method: "card",
            payment_status: status === "active" ? "paid" : "unpaid",
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
        });
      } catch (dbError) {
        // Compensation: if DB persist fails after Stripe created the sub, cancel it.
        logger.error("DB write failed after Stripe subscription create:", dbError);
        await stripe.subscriptions.cancel(subscription.id).catch((cancelError) => {
          logger.error(
            `Compensation cancel failed for ${subscription.id}: ${cancelError.message}`,
          );
        });
        throw dbError;
      }

      if (status === "active") {
        return res.status(200).json({
          message: "Subscription created successfully",
          subscriptionId: newDbSubscription.id,
          stripeId: subscription.id,
          status: "active",
        });
      }

      if (status === "incomplete") {
        // Frontend needs this to call confirmCardPayment.
        const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;
        if (!clientSecret) {
          return res.status(202).json({
            message: "Subscription created and is awaiting payment confirmation.",
            status: "incomplete",
            subscriptionId: newDbSubscription.id,
            stripeId: subscription.id,
          });
        }

        return res.status(200).json({
          message: "Payment confirmation required",
          status: "incomplete",
          subscriptionId: newDbSubscription.id,
          stripeId: subscription.id,
          clientSecret,
        });
      }

      return res.status(202).json({
        message: `Subscription created with status ${status}`,
        subscriptionId: newDbSubscription.id,
        stripeId: subscription.id,
        status,
      });
    } catch (error) {
      logger.error("Create Subscription Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Free plan flow (no payment method):
   * 1) Validate org + free plan
   * 2) Resolve customer
   * 3) Create Stripe subscription
   * 4) Persist local row
   */
  createFreeSubscription: async (req, res) => {
    try {
      const { plan_id, customer_name, address } = req.body;
      const { user_id, email: billingEmail } = req.user;

      const orgCheck = resolveOrganizationId(req);
      if (orgCheck.error) {
        return res.status(orgCheck.status).json({ message: orgCheck.error });
      }
      const organizationId = orgCheck.organizationId;

      if (!plan_id) {
        return res.status(400).json({ message: "Plan ID is required." });
      }

      // Prevent duplicate active/pending subscriptions for one org.
      const existingSub = await prisma.subscriptions.findFirst({
        where: {
          organization_id: organizationId,
          status: { in: NON_TERMINAL_STATUSES },
        },
        select: { id: true, status: true },
      });

      if (existingSub) {
        return res.status(409).json({
          message: `Organization already has a ${existingSub.status} subscription.`,
        });
      }

      const planResult = await getPlanOrFail(plan_id);
      if (planResult.error) {
        return res.status(planResult.status).json({ message: planResult.error });
      }
      const plan = planResult.plan;

      // Hard-check that this plan is truly free.
      const price = Number.parseFloat(plan.monthly_price ?? "0");
      if (Number.isNaN(price) || price > 0) {
        return res.status(400).json({
          message:
            "This is a paid plan. Please use the /create endpoint with payment details.",
        });
      }

      const requestKeyBase = `org:${organizationId}:plan:${plan_id}:user:${user_id}:free`;
      const customerId = await getOrCreateStripeCustomer({
        organizationId,
        billingEmail,
        customerName: customer_name,
        address,
        userId: user_id,
        idempotencyKeyPrefix: requestKeyBase,
      });

      const subscription = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: plan.stripe_price_id }],
          metadata: {
            organization_id: organizationId,
            plan_id,
            user_id,
            type: "free_tier",
          },
        },
        { idempotencyKey: `${requestKeyBase}:subscription:create` },
      );

      const status = subscription.status;
      const { periodStart, periodEnd } = getPeriodDates(subscription);

      const newDbSubscription = await prisma.subscriptions.create({
        data: {
          organization_id: organizationId,
          subscription_plan_id: plan_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: plan.stripe_price_id,
          status,
          payment_method: "free_tier",
          payment_status: "paid",
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      });

      return res.status(200).json({
        message: "Free subscription activated successfully",
        subscriptionId: newDbSubscription.id,
        status: "active",
      });
    } catch (error) {
      logger.error("Create Free Subscription Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Returns latest active subscription details for the current org.
   */
  getSubscriptionStatus: async (req, res) => {
    try {
      const { organization_id } = req.user;

      const sub = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: "active",
        },
        include: { plan: true },
        orderBy: { created_at: "desc" },
      });

      if (!sub) {
        return res.status(404).json({ message: "No active subscription found." });
      }

      const data = {
        plan_name: sub.plan?.plan_name || "Unknown Plan",
        amount_charged: parseFloat(sub.plan?.monthly_price || 0).toFixed(2),
        billing_cycle: "Monthly",
        payment_date: sub.current_period_start,
        payment_status: sub.payment_status || "unknown",
        next_billing_date: sub.current_period_end,
        next_amount: parseFloat(sub.plan?.monthly_price || 0).toFixed(2),
      };

      return res.status(200).json({ success: true, data });
    } catch (error) {
      logger.error("Get Subscription Status Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Free-tier eligibility check:
   * eligible = org has never had payment_method === "free_tier".
   */
  checkFreeEligibility: async (req, res) => {
    try {
      const { organization_id } = req.user;

      const previousFreeUsage = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          payment_method: "free_tier",
        },
      });

      const isEligible = !previousFreeUsage;

      return res.status(200).json({
        eligible: isEligible,
        message: isEligible
          ? "User can claim free trial"
          : "User has already used free trial",
      });
    } catch (error) {
      logger.error("Check Eligibility Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Invoice preview endpoint:
   * calculates subtotal/tax/total without creating a subscription.
   */
  previewInvoice: async (req, res) => {
    try {
      const { planId, zip } = req.body;

      if (!planId || !zip) {
        return res.status(400).json({ message: "Plan ID and ZIP code are required." });
      }

      const plan = await prisma.subscription_Plans.findUnique({
        where: { id: planId },
      });

      if (!plan?.stripe_price_id) {
        return res.status(404).json({ message: "Invalid Plan." });
      }

      const invoicePreview = await stripe.invoices.createPreview({
        customer_details: {
          address: {
            postal_code: zip,
            country: "US",
          },
        },
        subscription_details: {
          items: [{ price: plan.stripe_price_id, quantity: 1 }],
        },
        automatic_tax: { enabled: true },
      });

      // Stripe may split tax by jurisdiction; sum all components.
      const taxCents = (invoicePreview.total_tax_amounts || []).reduce(
        (sum, t) => sum + (t.amount || 0),
        0,
      );

      return res.status(200).json({
        subtotal: (invoicePreview.subtotal ?? 0) / 100,
        tax: taxCents / 100,
        total: (invoicePreview.total ?? 0) / 100,
        currency: invoicePreview.currency,
      });
    } catch (error) {
      logger.error("Invoice Preview Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Stripe webhook handler.
   * Note: route must receive raw body for signature verification.
   */
  handleWebhook: async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      logger.error(`Webhook Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          if (invoice.subscription) {
            const periodEndTs =
              invoice.lines?.data?.[0]?.period?.end || invoice.period_end || null;

            const result = await prisma.subscriptions.updateMany({
              where: { stripe_subscription_id: invoice.subscription },
              data: {
                status: "active",
                payment_status: "paid",
                ...(periodEndTs ? { current_period_end: new Date(periodEndTs * 1000) } : {}),
                updated_at: new Date(),
              },
            });

            if (result.count === 0) {
              logger.warn(`Webhook: No local subscription found for ${invoice.subscription}`);
            }
            logger.info(`Webhook: Subscription renewed ${invoice.subscription}`);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          if (invoice.subscription) {
            const result = await prisma.subscriptions.updateMany({
              where: { stripe_subscription_id: invoice.subscription },
              data: {
                status: "past_due",
                payment_status: "failed",
                updated_at: new Date(),
              },
            });

            if (result.count === 0) {
              logger.warn(`Webhook: No local subscription found for ${invoice.subscription}`);
            }
            logger.warn(`Webhook: Payment failed for ${invoice.subscription}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const result = await prisma.subscriptions.updateMany({
            where: { stripe_subscription_id: sub.id },
            data: {
              status: "canceled",
              auto_renew: false,
              updated_at: new Date(),
            },
          });

          if (result.count === 0) {
            logger.warn(`Webhook: No local subscription found for ${sub.id}`);
          }
          logger.info(`Webhook: Subscription canceled ${sub.id}`);
          break;
        }

        default:
          // Keep webhook endpoint resilient for unhandled event types.
          logger.info(`Webhook: ignored event type ${event.type}`);
      }
    } catch (error) {
      // Return non-2xx so Stripe can retry this event.
      logger.error(`Webhook processing error: ${error.message}`);
      return res.status(500).json({ received: false, error: "Processing failed" });
    }

    return res.json({ received: true });
  },
};

export default SubscriptionController;
