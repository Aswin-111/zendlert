
import logger from "../utils/logger.js";

const SubscriptionsController = {
  /**
   * STEP 1 — Retrieve Stripe Price for a Product
   * Equivalent to:
   * GET /v1/prices?product=xxx&limit=1
   */
  getPriceForProduct: async (req, res) => {
    try {
      const { product_id } = req.query;

      // -------------------------
      // 1. Validation
      // -------------------------
      if (!product_id) {
        return res.status(400).json({
          success: false,
          message: "product_id is required",
        });
      }

      // -------------------------
      // 2. Fetch prices from Stripe
      // -------------------------
      const prices = await stripe.prices.list({
        product: product_id,
        limit: 1,
        active: true,
      });

      if (!prices.data || prices.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active price found for product ${product_id}`,
        });
      }

      const price = prices.data[0];

      // -------------------------
      // 3. Success response
      // -------------------------
      return res.status(200).json({
        success: true,
        price: {
          stripe_price_id: price.id,
          currency: price.currency,
          unit_amount: price.unit_amount,
          recurring: price.recurring,
          billing_scheme: price.billing_scheme,
        },
      });
    } catch (error) {
      logger.error("getPriceForProduct error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve price from Stripe",
        error: error.message,
      });
    }
  },

  /**
   * STEP 2 — Create Stripe Customer
   */
  createCustomer: async (req, res) => {
    try {
      const {
        organization_id,
        name,
        email,
        address_line1,
        city,
        state,
        postal_code,
        country,
      } = req.body;

      // -------------------------
      // 1. Validation
      // -------------------------
      if (!organization_id || !email || !name) {
        return res.status(400).json({
          success: false,
          message: "organization_id, name and email are required",
        });
      }

      // -------------------------
      // 2. Ensure organization exists
      // -------------------------
      const organization = await prisma.organizations.findUnique({
        where: { organization_id },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found",
        });
      }

      // Prevent duplicate customer creation
      if (organization.stripe_customer_id) {
        return res.status(200).json({
          success: true,
          message: "Stripe customer already exists",
          stripe_customer_id: organization.stripe_customer_id,
        });
      }

      // -------------------------
      // 3. Create customer in Stripe
      // -------------------------
      const customer = await stripe.customers.create({
        name,
        email,
        address: {
          line1: address_line1,
          city,
          state,
          postal_code,
          country,
        },
        metadata: {
          organization_id,
          organization_name: organization.name,
        },
      });

      // -------------------------
      // 4. Save customer ID in DB
      // -------------------------
      await prisma.organizations.update({
        where: { organization_id },
        data: {
          stripe_customer_id: customer.id,
        },
      });

      // -------------------------
      // 5. Success response
      // -------------------------
      return res.status(201).json({
        success: true,
        message: "Stripe customer created successfully",
        customer: {
          stripe_customer_id: customer.id,
          name: customer.name,
          email: customer.email,
        },
      });
    } catch (error) {
      logger.error("createCustomer error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create Stripe customer",
        error: error.message,
      });
    }
  },

  /**
   * STEP 3 — Create Payment Method using Card Token
   */
  createPaymentMethod: async (req, res) => {
    try {
      const { card_token } = req.body;

      // -------------------------
      // 1. Validation
      // -------------------------
      if (!card_token) {
        return res.status(400).json({
          success: false,
          message: "card_token is required (e.g. tok_visa)",
        });
      }

      // -------------------------
      // 2. Create PaymentMethod
      // -------------------------
      const paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          token: card_token,
        },
      });

      // -------------------------
      // 3. Success response
      // -------------------------
      return res.status(201).json({
        success: true,
        message: "Payment method created successfully",
        payment_method: {
          payment_method_id: paymentMethod.id,
          type: paymentMethod.type,
          card: {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            exp_month: paymentMethod.card.exp_month,
            exp_year: paymentMethod.card.exp_year,
          },
        },
      });
    } catch (error) {
      logger.error("createPaymentMethod error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create payment method",
        error: error.message,
      });
    }
  },

  /**
   * STEP 4 — Attach Payment Method to Customer
   */
  attachPaymentMethodToCustomer: async (req, res) => {
    try {
      const { organization_id, payment_method_id } = req.body;

      // -------------------------
      // 1. Validation
      // -------------------------
      if (!organization_id || !payment_method_id) {
        return res.status(400).json({
          success: false,
          message: "organization_id and payment_method_id are required",
        });
      }

      // -------------------------
      // 2. Fetch organization & customer
      // -------------------------
      const organization = await prisma.organizations.findUnique({
        where: { organization_id },
      });

      if (!organization || !organization.stripe_customer_id) {
        return res.status(404).json({
          success: false,
          message: "Stripe customer not found for organization",
        });
      }

      const customerId = organization.stripe_customer_id;

      // -------------------------
      // 3. Attach PaymentMethod
      // -------------------------
      await stripe.paymentMethods.attach(payment_method_id, {
        customer: customerId,
      });

      // -------------------------
      // 4. Set as default payment method
      // -------------------------
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
      });

      // -------------------------
      // 5. Success response
      // -------------------------
      return res.status(200).json({
        success: true,
        message: "Payment method attached and set as default",
        data: {
          stripe_customer_id: customerId,
          payment_method_id,
        },
      });
    } catch (error) {
      logger.error("attachPaymentMethodToCustomer error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to attach payment method to customer",
        error: error.message,
      });
    }
  },

  /**
   * STEP 5 — Create Stripe Subscription
   */
  createSubscription: async (req, res) => {
    try {
      const {
        organization_id,
        subscription_plan_id,
        stripe_price_id,
        payment_method_id,
      } = req.body;

      // -------------------------
      // 1. Validation
      // -------------------------
      if (
        !organization_id ||
        !subscription_plan_id ||
        !stripe_price_id ||
        !payment_method_id
      ) {
        return res.status(400).json({
          success: false,
          message:
            "organization_id, subscription_plan_id, stripe_price_id and payment_method_id are required",
        });
      }

      // -------------------------
      // 2. Fetch organization
      // -------------------------
      const organization = await prisma.organizations.findUnique({
        where: { organization_id },
      });

      if (!organization || !organization.stripe_customer_id) {
        return res.status(404).json({
          success: false,
          message: "Stripe customer not found for organization",
        });
      }

      const customerId = organization.stripe_customer_id;

      // -------------------------
      // 3. Create Stripe subscription
      // -------------------------
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: stripe_price_id }],
        default_payment_method: payment_method_id,
        expand: ["latest_invoice.payment_intent"],
      });

      // -------------------------
      // 4. Persist subscription in DB
      // -------------------------
      const createdSubscription = await prisma.subscriptions.create({
        data: {
          organization_id,
          subscription_plan_id,

          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: stripe_price_id,

          status: subscription.status,
          payment_status:
            subscription.latest_invoice?.payment_intent?.status ?? "pending",

          current_period_start: new Date(
            subscription.current_period_start * 1000
          ),
          current_period_end: new Date(subscription.current_period_end * 1000),

          auto_renew: true,
        },
      });

      // -------------------------
      // 5. Update organization status
      // -------------------------
      await prisma.organizations.update({
        where: { organization_id },
        data: {
          status_id: "active", // OR map to Organization_Statuses table if needed
        },
      });

      // -------------------------
      // 6. Success response
      // -------------------------
      return res.status(201).json({
        success: true,
        message: "Subscription created successfully",
        subscription: {
          id: createdSubscription.id,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          billing_period: {
            start: createdSubscription.current_period_start,
            end: createdSubscription.current_period_end,
          },
          payment_intent_status:
            subscription.latest_invoice?.payment_intent?.status,
        },
      });
    } catch (error) {
      logger.error("createSubscription error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create subscription",
        error: error.message,
      });
    }
  },
};

export default SubscriptionsController;
