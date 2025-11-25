import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

export const SubscriptionsController = {
  // ---------------- CREATE CUSTOMER ----------------
  createCustomer: async (req, res) => {
    try {
      const { body } = req.validated;
      const { email, name, organization_id } = body;

      // 1) Ensure org exists
      const org = await prisma.organizations.findUnique({
        where: { organization_id },
      });
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // 2) If org already has a customer, you might reuse it
      if (org.stripe_customer_id) {
        return res.json({
          message: "Customer already exists for this organization",
          customer_id: org.stripe_customer_id,
        });
      }

      // 3) Create customer in Stripe
      const customer = await stripe.customers.create({
        email,
        name: name || undefined,
      });

      // 4) Save stripe_customer_id in DB
      const updatedOrg = await prisma.organizations.update({
        where: { organization_id },
        data: { stripe_customer_id: customer.id },
      });

      return res.json({
        message: "Customer created and linked to organization",
        customer,
        organization: updatedOrg,
      });
    } catch (error) {
      console.error("createCustomer error:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  },
  // ---------------- CREATE SUBSCRIPTION ----------------
  createSubscription: async (req, res) => {
    try {
      const { body } = req.validated;
      const {
        organization_id,
        subscription_plan_id,
        stripe_customer_id,
        stripe_price_id,
        auto_renew,
      } = body;

      // org check
      const org = await prisma.organizations.findUnique({
        where: { organization_id },
      });
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // plan check
      const plan = await prisma.subscription_Plans.findUnique({
        where: { id: subscription_plan_id },
      });
      if (!plan || !plan.is_active) {
        return res
          .status(404)
          .json({ message: "Subscription plan not found or inactive" });
      }

      // Create subscription in Stripe
      const subscription = await stripe.subscriptions.create({
        customer: stripe_customer_id,
        items: [{ price: stripe_price_id }],
        payment_behavior: "default_incomplete",
        expand: ["latest_invoice.payment_intent"],
      });

      const saved = await prisma.subscriptions.create({
        data: {
          organization_id,
          subscription_plan_id,
          stripe_customer_id,
          stripe_subscription_id: subscription.id,
          stripe_price_id,
          status: subscription.status,
          payment_status: "unpaid",
          auto_renew: auto_renew ?? false,
          current_period_start: new Date(
            subscription.current_period_start * 1000
          ),
          current_period_end: new Date(subscription.current_period_end * 1000),
        },
      });

      res.json({
        message: "Subscription created",
        subscription,
        db: saved,
      });
    } catch (error) {
      console.error("createSubscription error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  },

  // ---------------- INVOICE PREVIEW ----------------
  invoicePreview: async (req, res) => {
    try {
      const { body } = req.validated;
      const { customer_id, price_id } = body;

      const upcoming = await stripe.invoices.retrieveUpcoming({
        customer: customer_id,
        subscription_items: [{ price: price_id }],
      });

      res.json({ invoice_preview: upcoming });
    } catch (error) {
      console.error("invoicePreview error:", error);
      res.status(500).json({ message: "Failed to preview invoice" });
    }
  },

  // ---------------- CANCEL SUBSCRIPTION ----------------
  cancelSubscription: async (req, res) => {
    try {
      const { body } = req.validated;
      const { stripe_subscription_id } = body;

      const canceled = await stripe.subscriptions.del(stripe_subscription_id);

      await prisma.subscriptions.updateMany({
        where: { stripe_subscription_id },
        data: { status: "canceled", payment_status: "unpaid" },
      });

      res.json({
        message: "Subscription canceled",
        canceled,
      });
    } catch (error) {
      console.error("cancelSubscription error:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  },

  // ---------------- UPDATE SUBSCRIPTION ----------------
  updateSubscription: async (req, res) => {
    try {
      const { body } = req.validated;
      const { stripe_subscription_id, new_price_id } = body;

      const subscription = await stripe.subscriptions.retrieve(
        stripe_subscription_id
      );
      if (!subscription) {
        return res
          .status(404)
          .json({ message: "Stripe subscription not found" });
      }

      const updated = await stripe.subscriptions.update(
        stripe_subscription_id,
        {
          cancel_at_period_end: false,
          items: [
            {
              id: subscription.items.data[0].id,
              price: new_price_id,
            },
          ],
        }
      );

      await prisma.subscriptions.updateMany({
        where: { stripe_subscription_id },
        data: {
          stripe_price_id: new_price_id,
          status: updated.status,
          current_period_start: new Date(updated.current_period_start * 1000),
          current_period_end: new Date(updated.current_period_end * 1000),
        },
      });

      res.json({
        message: "Subscription updated",
        updated,
      });
    } catch (error) {
      console.error("updateSubscription error:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  },

  // ---------------- LIST SUBSCRIPTIONS ----------------
  listSubscriptions: async (req, res) => {
    try {
      const { query } = req.validated;
      const { organization_id } = query || {};

      const where = organization_id ? { organization_id } : {};

      const data = await prisma.subscriptions.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: { plan: true },
      });

      res.json(data);
    } catch (error) {
      console.error("listSubscriptions error:", error);
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  },

  // ---------------- STRIPE WEBHOOK ----------------
  webhookHandler: async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body, // raw body (buffer)
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          const stripeSubscriptionId = invoice.subscription;

          await prisma.subscriptions.updateMany({
            where: { stripe_subscription_id: stripeSubscriptionId },
            data: { payment_status: "paid" },
          });
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const stripeSubscriptionId = invoice.subscription;

          await prisma.subscriptions.updateMany({
            where: { stripe_subscription_id: stripeSubscriptionId },
            data: { payment_status: "failed" },
          });
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object;

          await prisma.subscriptions.updateMany({
            where: { stripe_subscription_id: sub.id },
            data: {
              status: sub.status,
              current_period_start: new Date(sub.current_period_start * 1000),
              current_period_end: new Date(sub.current_period_end * 1000),
            },
          });
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object;

          await prisma.subscriptions.updateMany({
            where: { stripe_subscription_id: sub.id },
            data: { status: "canceled" },
          });
          break;
        }

        default:
          // ignore others for now
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook handler error:", error);
      res.status(500).send("Webhook handler error");
    }
  },
};
