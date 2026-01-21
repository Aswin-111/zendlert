import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SubscriptionController = {
  /**
   * @description Creates a Subscription using a Payment Method ID from the frontend.
   * Matches the flow: Price -> Customer -> Attach PM -> Subscribe.
   * @route POST /api/v1/subscriptions/create
   */
  createSubscription: async (req, res) => {
    try {
      const {
        plan_id, // UUID from your DB
        organization_id,
        payment_method_id, // "pm_..." ID from frontend (stripe.createPaymentMethod)
        customer_name,
        address, // Optional: { line1, city, state, postal_code, country }
      } = req.body;

      const { user_id, email: userEmail } = req.user; // From verifyJWT
      const billingEmail = userEmail;

      // 1. Validate Input
      if (!plan_id || !organization_id || !payment_method_id) {
        return res.status(400).json({
          message: "Plan ID, Org ID, and Payment Method ID are required.",
        });
      }

      // 2. Retrieve Price (from DB)
      const plan = await prisma.subscription_Plans.findUnique({
        where: { id: plan_id },
      });

      if (!plan || !plan.stripe_price_id) {
        return res.status(404).json({ message: "Plan or Price ID not found." });
      }

      // 3. Find or Create Stripe Customer
      let customerId;
      const existingSub = await prisma.subscriptions.findFirst({
        where: { organization_id },
        select: { stripe_customer_id: true },
      });

      if (existingSub?.stripe_customer_id) {
        customerId = existingSub.stripe_customer_id;
        logger.info(`Using existing customer: ${customerId}`);
      } else {
        // Create new customer
        const customerData = {
          email: billingEmail,
          name: customer_name || `Org: ${organization_id}`,
          metadata: { organization_id, user_id },
        };
        if (address) customerData.address = address;

        const customer = await stripe.customers.create(customerData);
        customerId = customer.id;
        logger.info(`Created new customer: ${customerId}`);
      }

      // 4. Attach Payment Method to Customer
      try {
        await stripe.paymentMethods.attach(payment_method_id, {
          customer: customerId,
        });

        // Set as default for invoices
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: payment_method_id },
        });
      } catch (attachError) {
        logger.error("Payment Method Attach Error:", attachError);
        return res.status(400).json({
          message: "Failed to attach payment method.",
          error: attachError.message,
        });
      }

      // 5. Create Subscription
      // We expand latest_invoice.payment_intent to check if 3D Secure is needed
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripe_price_id }],
        default_payment_method: payment_method_id,
        expand: ["latest_invoice.payment_intent"],
        automatic_tax: {
          enabled: false,
        },
        metadata: {
          organization_id,
          plan_id,
          user_id,
        },
      });

      // 6. Save to Database
      // We determine status based on Stripe response
      const status = subscription.status; // 'active', 'incomplete', etc.

      const periodStart = subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000)
        : new Date();

      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : new Date();

      await prisma.subscriptions.create({
        data: {
          organization_id,
          subscription_plan_id: plan_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: plan.stripe_price_id,
          status: status,
          payment_method: "card",
          payment_status: status === "active" ? "paid" : "unpaid",
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      });

      // 7. Handle Response
      if (status === "active") {
        return res.status(200).json({
          message: "Subscription created successfully",
          subscriptionId: subscription.id,
          status: "active",
        });
      } else if (status === "incomplete") {
        // 3D Secure or other auth required
        const clientSecret =
          subscription.latest_invoice.payment_intent.client_secret;
        return res.status(200).json({
          message: "Payment confirmation required",
          status: "incomplete",
          subscriptionId: subscription.id,
          clientSecret: clientSecret, // Frontend needs this for confirmCardPayment
        });
      }

      return res
        .status(400)
        .json({ message: "Subscription created but status is " + status });
    } catch (error) {
      logger.error("Create Subscription Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * @description Calculates estimated tax and total for a potential subscription.
   * Does NOT create a subscription or charge the user.
   * @route POST /api/v1/subscriptions/preview
   */
  previewInvoice: async (req, res) => {
    try {
      const { planId, zip } = req.body;

      if (!planId || !zip) {
        return res
          .status(400)
          .json({ message: "Plan ID and ZIP code are required." });
      }

      const plan = await prisma.subscription_Plans.findUnique({
        where: { id: planId },
      });

      if (!plan?.stripe_price_id) {
        return res.status(404).json({ message: "Invalid Plan." });
      }

      const invoicePreview = await stripe.invoices.createPreview({
        // If you already have a customer id, you can pass `customer: cus_...` instead.
        customer_details: {
          address: {
            postal_code: zip,
            country: "US",
          },
        },

        // Preview creating a subscription with this price:
        subscription_details: {
          items: [{ price: plan.stripe_price_id, quantity: 1 }],
        },

        automatic_tax: { enabled: true },
      });

      // Stripe may return multiple tax components; safest is summing total_tax_amounts.
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
   * @description Webhook Handler for Async Events (Renewals, Cancellations)
   * @route POST /api/v1/subscriptions/webhook
   */
  handleWebhook: async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      // Must use RAW BODY here
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
            // Update DB to Active/Paid
            await prisma.subscriptions.update({
              where: { stripe_subscription_id: invoice.subscription },
              data: {
                status: "active",
                payment_status: "paid",
                current_period_end: new Date(
                  invoice.lines.data[0].period.end * 1000,
                ),
                updated_at: new Date(),
              },
            });
            logger.info(
              `Webhook: Subscription renewed ${invoice.subscription}`,
            );
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          if (invoice.subscription) {
            // Update DB to Past Due/Failed
            await prisma.subscriptions.update({
              where: { stripe_subscription_id: invoice.subscription },
              data: {
                status: "past_due",
                payment_status: "failed",
                updated_at: new Date(),
              },
            });
            logger.warn(`Webhook: Payment failed for ${invoice.subscription}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object;
          await prisma.subscriptions.update({
            where: { stripe_subscription_id: sub.id },
            data: {
              status: "canceled",
              auto_renew: false,
              updated_at: new Date(),
            },
          });
          logger.info(`Webhook: Subscription canceled ${sub.id}`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Webhook processing error: ${error.message}`);
      // Return 200 so Stripe doesn't retry indefinitely on logic errors
      return res.json({ received: true, error: "Processing failed" });
    }

    res.json({ received: true });
  },
};

export default SubscriptionController;
