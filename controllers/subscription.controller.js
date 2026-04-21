import Stripe from "stripe";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import {
  normalizeIncomingDateOnlyToUtc,
  normalizeUnixSecondsToUtcDateOnly,
  utcNow,
} from "../utils/datetime.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isFreePlan = (plan) => {
  if (!plan) return false;
  return Number(plan.monthly_price) === 0 && Number(plan.annual_price) === 0;
};

const buildFreePeriodDates = () => {
  const now = utcNow();
  const start = normalizeIncomingDateOnlyToUtc(now);

  const endInstant = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const end = normalizeIncomingDateOnlyToUtc(endInstant);

  return { start, end };
};

const createOrReuseStripeCustomer = async ({
  organization_id,
  user_id,
  billingEmail,
  customer_name,
  address,
}) => {
  const existingPaidOrFreeSub = await prisma.subscriptions.findFirst({
    where: { organization_id },
    select: { stripe_customer_id: true },
    orderBy: { created_at: "desc" },
  });

  if (
    existingPaidOrFreeSub?.stripe_customer_id &&
    String(existingPaidOrFreeSub.stripe_customer_id).startsWith("cus_")
  ) {
    logger.info(`Using existing Stripe customer: ${existingPaidOrFreeSub.stripe_customer_id}`);
    return existingPaidOrFreeSub.stripe_customer_id;
  }

  const customerData = {
    email: billingEmail,
    name: customer_name || `Org: ${organization_id}`,
    metadata: { organization_id, user_id },
  };

  if (address) customerData.address = address;

  const customer = await stripe.customers.create(customerData);
  logger.info(`Created Stripe customer: ${customer.id}`);
  return customer.id;
};

const SubscriptionController = {
  getPlansWithCurrentPlan: async (req, res) => {
    try {
      const organization_id = req.user?.organization_id;

      if (!organization_id) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const plans = await prisma.subscription_Plans.findMany({
        where: { is_active: true },
        orderBy: { monthly_price: "asc" },
        select: {
          id: true,
          plan_name: true,
          description: true,
          stripe_price_id: true,
          monthly_price: true,
          annual_price: true,
          user_limit: true,
          site_limit: true,
          area_limit: true,
          alert_limit: true,
          is_active: true,
          Plan_Features: {
            where: { is_enabled: true },
            select: {
              is_enabled: true,
              feature: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      const currentSubscription = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: "active",
          current_period_end: {
            gte: new Date(),
          },
        },
        orderBy: {
          created_at: "desc",
        },
        select: {
          id: true,
          subscription_plan_id: true,
          stripe_subscription_id: true,
          stripe_price_id: true,
          status: true,
          payment_status: true,
          payment_method: true,
          auto_renew: true,
          current_period_start: true,
          current_period_end: true,
          plan: {
            select: {
              id: true,
              plan_name: true,
              description: true,
              monthly_price: true,
              annual_price: true,
            },
          },
        },
      });

      const mappedPlans = plans.map((plan) => ({
        id: plan.id,
        plan_name: plan.plan_name,
        description: plan.description,
        stripe_price_id: plan.stripe_price_id,
        monthly_price: Number(plan.monthly_price),
        annual_price: Number(plan.annual_price),
        limits: {
          users: plan.user_limit,
          sites: plan.site_limit,
          areas: plan.area_limit,
          alerts_per_month: plan.alert_limit,
        },
        features: plan.Plan_Features.map((item) => ({
          id: item.feature.id,
          name: item.feature.name,
          code: item.feature.code,
          description: item.feature.description,
        })),
        is_current_plan: currentSubscription?.subscription_plan_id === plan.id,
        button_label:
          currentSubscription?.subscription_plan_id === plan.id
            ? "Current Plan"
            : `Select ${plan.plan_name}`,
      }));

      return res.status(200).json({
        success: true,
        data: {
          current_plan: currentSubscription
            ? {
              subscription_id: currentSubscription.id,
              subscription_plan_id: currentSubscription.subscription_plan_id,
              stripe_subscription_id:
                currentSubscription.stripe_subscription_id,
              stripe_price_id: currentSubscription.stripe_price_id,
              status: currentSubscription.status,
              payment_status: currentSubscription.payment_status,
              payment_method: currentSubscription.payment_method,
              auto_renew: currentSubscription.auto_renew,
              current_period_start:
                currentSubscription.current_period_start,
              current_period_end:
                currentSubscription.current_period_end,
              plan: {
                id: currentSubscription.plan.id,
                plan_name: currentSubscription.plan.plan_name,
                description: currentSubscription.plan.description,
                monthly_price: Number(
                  currentSubscription.plan.monthly_price
                ),
                annual_price: Number(
                  currentSubscription.plan.annual_price
                ),
              },
            }
            : null,
          plans: mappedPlans,
        },
      });
    } catch (error) {
      logger.error("getPlansWithCurrentPlan error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  createSubscription: async (req, res) => {
    try {
      const {
        plan_id,
        organization_id,
        payment_method_id,
        customer_name,
        address,
      } = req.body;

      const { user_id, email: userEmail } = req.user;
      const billingEmail = userEmail;
      const STARTER_TRIAL_DAYS = 30;

      if (!plan_id || !organization_id) {
        return res.status(400).json({
          success: false,
          message: "Plan ID and Organization ID are required.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 1. Get plan
      // ─────────────────────────────────────────────────────────────────────────
      const plan = await prisma.subscription_Plans.findUnique({
        where: { id: plan_id },
      });

      if (!plan || !plan.stripe_price_id) {
        return res.status(404).json({
          success: false,
          message: "Plan or Stripe price not found.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. Get organization
      // ─────────────────────────────────────────────────────────────────────────
      const organization = await prisma.organizations.findUnique({
        where: { organization_id },
        select: {
          organization_id: true,
          name: true,
          stripe_customer_id: true,
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Organization not found.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Resolve stale incomplete subscriptions BEFORE checking for conflicts.
      // ─────────────────────────────────────────────────────────────────────────
      const existingOpenSub = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: { in: ["active", "trialing", "incomplete"] },
        },
        orderBy: { created_at: "desc" },
      });

      if (existingOpenSub) {
        if (["active", "trialing"].includes(existingOpenSub.status)) {
          const isTrialingConflict = existingOpenSub.status === "trialing";
          return res.status(409).json({
            success: false,
            message: isTrialingConflict
              ? "Your free trial is still active. You will be automatically billed after it ends."
              : "An active or trial subscription already exists for this organization.",
            data: {
              id: existingOpenSub.id,
              status: existingOpenSub.status,
              stripe_subscription_id: existingOpenSub.stripe_subscription_id,
              current_period_end: existingOpenSub.current_period_end,
            },
          });
        }

        if (existingOpenSub.status === "incomplete") {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(
              existingOpenSub.stripe_subscription_id
            );

            if (["active", "trialing"].includes(stripeSub.status)) {
              await prisma.subscriptions.update({
                where: { id: existingOpenSub.id },
                data: {
                  status: stripeSub.status,
                  payment_status:
                    stripeSub.status === "trialing" ? "trialing" : "paid",
                  updated_at: new Date(),
                },
              });

              return res.status(409).json({
                success: false,
                message: "A subscription already exists for this organization.",
                data: {
                  id: existingOpenSub.id,
                  status: stripeSub.status,
                  stripe_subscription_id: existingOpenSub.stripe_subscription_id,
                },
              });
            }

            // Still incomplete — cancel and clean up.
            await stripe.subscriptions.cancel(
              existingOpenSub.stripe_subscription_id
            );

            await prisma.subscriptions.update({
              where: { id: existingOpenSub.id },
              data: {
                status: "cancelled",
                payment_status: "cancelled",
                auto_renew: false,
                updated_at: new Date(),
              },
            });

            logger.info(
              `Cancelled stale incomplete subscription ${existingOpenSub.stripe_subscription_id}`
            );
          } catch (err) {
            logger.error("Failed to resolve existing incomplete subscription", err);
            return res.status(409).json({
              success: false,
              message:
                "A pending subscription already exists and could not be auto-resolved. Please contact support.",
              data: {
                id: existingOpenSub.id,
                status: existingOpenSub.status,
                stripe_subscription_id: existingOpenSub.stripe_subscription_id,
              },
            });
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. Get or create Stripe customer — verify the ID exists before reusing.
      //    Handles stale IDs from test/live mode mismatches or deleted customers.
      // ─────────────────────────────────────────────────────────────────────────
      let customerId = organization.stripe_customer_id;

      const createStripeCustomer = async () => {
        const customerPayload = {
          email: billingEmail,
          name: customer_name || organization.name || `Org ${organization_id}`,
          metadata: { organization_id, user_id },
        };

        if (address) customerPayload.address = address;

        const customer = await stripe.customers.create(customerPayload);

        await prisma.organizations.update({
          where: { organization_id },
          data: { stripe_customer_id: customer.id },
        });

        logger.info(`Created new Stripe customer: ${customer.id}`);
        return customer.id;
      };

      if (customerId) {
        try {
          const existing = await stripe.customers.retrieve(customerId);
          if (existing.deleted) {
            logger.warn(`Stripe customer ${customerId} is deleted. Creating a new one.`);
            customerId = await createStripeCustomer();
          } else {
            logger.info(`Reusing existing Stripe customer: ${customerId}`);
          }
        } catch (retrieveErr) {
          const msg = String(retrieveErr?.message || "").toLowerCase();
          if (msg.includes("no such customer")) {
            logger.warn(`Stale Stripe customer ID ${customerId} not found. Creating a new one.`);
            customerId = await createStripeCustomer();
          } else {
            logger.error("Stripe customer retrieve error:", retrieveErr);
            return res.status(500).json({
              success: false,
              message: "Failed to verify Stripe customer.",
              error: retrieveErr.message,
            });
          }
        }
      } else {
        customerId = await createStripeCustomer();
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 5. Attach & set default payment method.
      // ─────────────────────────────────────────────────────────────────────────
      if (payment_method_id) {
        try {
          await stripe.paymentMethods.attach(payment_method_id, {
            customer: customerId,
          });
        } catch (attachError) {
          const msg = String(attachError?.message || "").toLowerCase();
          if (!msg.includes("already attached")) {
            logger.error("Payment method attach error:", attachError);
            return res.status(400).json({
              success: false,
              message: "Failed to attach payment method.",
              error: attachError.message,
            });
          }
        }

        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: payment_method_id },
        });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 6. Determine plan type.
      // ─────────────────────────────────────────────────────────────────────────
      const normalizedPlanName = String(plan.plan_name || "").trim().toLowerCase();
      const isStarterPlan = normalizedPlanName === "starter";

      if (!isStarterPlan && !payment_method_id) {
        return res.status(400).json({
          success: false,
          message: "Payment method is required for non-trial subscriptions.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 7. Build Stripe subscription payload.
      //
      //    TRIAL (Starter):
      //      - No payment_behavior; Stripe creates a $0 invoice automatically.
      //      - Sub starts as "trialing" immediately.
      //
      //    PAID (non-Starter):
      //      - Do NOT use payment_behavior: "default_incomplete".
      //        Debug confirmed that with newer Stripe API versions this creates
      //        an invoice with NO payment_intent attached ("attempted": false),
      //        making it impossible to get a client_secret.
      //
      //      - Instead: omit payment_behavior entirely so Stripe attempts the
      //        charge immediately using the default_payment_method we set above.
      //        Stripe will charge the card and the sub becomes "active" directly
      //        if the card succeeds — no frontend confirmation step needed for
      //        standard cards. For cards requiring 3DS, Stripe returns
      //        "incomplete" and we retrieve the PaymentIntent via the invoice's
      //        payment field (new Stripe API shape) to get the client_secret.
      // ─────────────────────────────────────────────────────────────────────────
      const subscriptionPayload = {
        customer: customerId,
        items: [{ price: plan.stripe_price_id }],
        metadata: {
          organization_id,
          plan_id,
          user_id,
          subscription_type: isStarterPlan ? "starter_trial" : "paid",
        },
        automatic_tax: { enabled: false },
        expand: ["latest_invoice.payment_intent"],
      };

      if (isStarterPlan) {
        subscriptionPayload.trial_period_days = STARTER_TRIAL_DAYS;
        subscriptionPayload.trial_settings = {
          end_behavior: { missing_payment_method: "cancel" },
        };
        if (payment_method_id) {
          subscriptionPayload.default_payment_method = payment_method_id;
        }
      } else {
        // Let Stripe attempt the charge immediately.
        // default_payment_method was already set on the customer above.
        subscriptionPayload.default_payment_method = payment_method_id;
        subscriptionPayload.off_session = true; // tells Stripe to charge without user present
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 8. Create Stripe subscription.
      // ─────────────────────────────────────────────────────────────────────────
      const subscription = await stripe.subscriptions.create(subscriptionPayload);
      const status = subscription.status;

      logger.info(`Created Stripe subscription: ${subscription.id} | status: ${status}`);

      // ─────────────────────────────────────────────────────────────────────────
      // 9. Extract client_secret if subscription requires payment confirmation.
      //
      //    New Stripe API shape for invoices:
      //      invoice.payment_intent        → may be undefined in newer versions
      //      invoice.payment.payment_intent → the actual PI object/ID (new shape)
      //
      //    We check both locations to support all Stripe API versions.
      // ─────────────────────────────────────────────────────────────────────────
      let clientSecret = null;
      let paymentIntentId = null;

      if (status === "incomplete") {
        const invoice = subscription.latest_invoice;

        if (invoice && typeof invoice === "object") {
          // Try old shape first: invoice.payment_intent
          let pi = invoice.payment_intent ?? null;

          // Try new shape: invoice.payment.payment_intent
          if (!pi && invoice.payment && typeof invoice.payment === "object") {
            pi = invoice.payment.payment_intent ?? null;
          }

          if (pi && typeof pi === "object") {
            clientSecret = pi.client_secret ?? null;
            paymentIntentId = pi.id ?? null;
          } else if (typeof pi === "string") {
            // PI is just an ID string — fetch it directly.
            logger.info(`Fetching PaymentIntent directly: ${pi}`);
            const fetchedPi = await stripe.paymentIntents.retrieve(pi);
            clientSecret = fetchedPi.client_secret ?? null;
            paymentIntentId = fetchedPi.id ?? null;
          }

          // Last resort: if still no PI, fetch the invoice's PI via invoice.id
          if (!clientSecret && invoice.id) {
            logger.warn(
              `No payment_intent on invoice ${invoice.id} — fetching invoice directly with expand.`
            );
            const freshInvoice = await stripe.invoices.retrieve(invoice.id, {
              expand: ["payment_intent"],
            });

            const freshPi = freshInvoice.payment_intent;
            if (freshPi && typeof freshPi === "object") {
              clientSecret = freshPi.client_secret ?? null;
              paymentIntentId = freshPi.id ?? null;
            } else if (typeof freshPi === "string") {
              const fetchedPi = await stripe.paymentIntents.retrieve(freshPi);
              clientSecret = fetchedPi.client_secret ?? null;
              paymentIntentId = fetchedPi.id ?? null;
            }
          }
        }

        if (!clientSecret) {
          logger.error(
            `Could not extract client_secret for subscription ${subscription.id}. ` +
            `This may require manual investigation.`
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 10. Normalize dates.
      // ─────────────────────────────────────────────────────────────────────────
      const startTs = subscription.current_period_start;
      const endTs = subscription.current_period_end;

      const periodStart =
        (startTs ? normalizeUnixSecondsToUtcDateOnly(startTs) : null) ??
        normalizeIncomingDateOnlyToUtc(utcNow());

      const periodEnd =
        (endTs ? normalizeUnixSecondsToUtcDateOnly(endTs) : null) ??
        normalizeIncomingDateOnlyToUtc(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        );

      const paymentStatus =
        status === "active"
          ? "paid"
          : status === "trialing"
            ? "trialing"
            : status === "incomplete"
              ? "pending_confirmation"
              : "unpaid";

      // ─────────────────────────────────────────────────────────────────────────
      // 11. Persist to DB.
      // ─────────────────────────────────────────────────────────────────────────
      const newDbSubscription = await prisma.subscriptions.create({
        data: {
          organization_id,
          subscription_plan_id: plan_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: plan.stripe_price_id,
          status,
          payment_method: payment_method_id ? "card" : null,
          payment_status: paymentStatus,
          auto_renew: true,
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      });

      // ─────────────────────────────────────────────────────────────────────────
      // 12. Respond.
      // ─────────────────────────────────────────────────────────────────────────
      if (status === "trialing") {
        return res.status(200).json({
          success: true,
          message: "Free trial started successfully",
          data: {
            subscriptionId: newDbSubscription.id,
            stripeId: subscription.id,
            status: "trialing",
            trial_start: subscription.trial_start,
            trial_end: subscription.trial_end,
          },
        });
      }

      if (status === "active") {
        // Card was charged immediately — no frontend confirmation needed.
        return res.status(200).json({
          success: true,
          message: "Subscription created successfully",
          data: {
            subscriptionId: newDbSubscription.id,
            stripeId: subscription.id,
            status: "active",
          },
        });
      }

      if (status === "incomplete") {
        // 3DS / additional authentication required.
        // Frontend must call: await stripe.confirmCardPayment(clientSecret)
        // After success Stripe fires invoice.payment_succeeded webhook →
        // update subscription status to "active" in your DB.
        return res.status(200).json({
          success: true,
          message: "Payment confirmation required",
          data: {
            subscriptionId: newDbSubscription.id,
            stripeId: subscription.id,
            status: "incomplete",
            clientSecret,
            paymentIntentId,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: `Subscription created but returned unexpected status: ${status}`,
        data: {
          subscriptionId: newDbSubscription.id,
          stripeId: subscription.id,
          status,
        },
      });
    } catch (error) {
      logger.error("Create Subscription Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/v1/subscriptions/billing-portal
  // Creates a Stripe Customer Portal session and returns the redirect URL.
  //
  // organization_id comes from req.user (set by verifyAdminAccess middleware).
  // Body:
  //   return_url  string  optional — where Stripe sends the user when done
  //                       (defaults to FRONTEND_URL/web/subscription-management)
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/v1/subscriptions/manage
  // organization_id comes from req.user (set by verifyAdminAccess middleware).
  // No query params or body needed.
  // ─────────────────────────────────────────────────────────────────────────────

  getSubscriptionDetails: async (req, res) => {
    try {
      // organization_id is decoded from the JWT by verifyAdminAccess
      const { organization_id } = req.user;

      if (!organization_id) {
        return res.status(400).json({
          success: false,
          message: "Organization ID is missing from token. Please log in again.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 1. Find the active/trialing subscription in DB
      // ─────────────────────────────────────────────────────────────────────
      const subscription = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: { in: ["active", "trialing"] },
        },
        orderBy: { created_at: "desc" },
        include: {
          plan: {
            include: {
              Plan_Features: {
                include: {
                  feature: true,
                },
                where: {
                  is_enabled: true,
                },
              },
            },
          },
        },
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "No active subscription found for this organization.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 2. Fetch live data from Stripe — billing dates and payment method
      // ─────────────────────────────────────────────────────────────────────
      let stripeData = {
        current_period_end: subscription.current_period_end,
        payment_method: null,
        trial_end: null,
        cancel_at_period_end: false,
      };

      try {
        const stripeSub = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id,
          {
            expand: [
              "default_payment_method",
              "customer.invoice_settings.default_payment_method",
            ],
          }
        );

        stripeData.current_period_end = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : subscription.current_period_end;

        stripeData.trial_end = stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000).toISOString()
          : null;

        stripeData.cancel_at_period_end =
          stripeSub.cancel_at_period_end ?? false;

        // Resolve payment method — check multiple locations in priority order
        let pm = null;

        if (
          stripeSub.default_payment_method &&
          typeof stripeSub.default_payment_method === "object"
        ) {
          pm = stripeSub.default_payment_method;
        } else if (
          stripeSub.customer &&
          typeof stripeSub.customer === "object" &&
          stripeSub.customer.invoice_settings?.default_payment_method
        ) {
          const invoicePm =
            stripeSub.customer.invoice_settings.default_payment_method;
          pm = typeof invoicePm === "object" ? invoicePm : null;

          if (!pm && typeof invoicePm === "string") {
            pm = await stripe.paymentMethods.retrieve(invoicePm);
          }
        }

        if (!pm && subscription.stripe_customer_id) {
          const pmList = await stripe.paymentMethods.list({
            customer: subscription.stripe_customer_id,
            type: "card",
            limit: 1,
          });
          pm = pmList.data[0] ?? null;
        }

        if (pm?.card) {
          stripeData.payment_method = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
          };
        }
      } catch (stripeErr) {
        logger.warn(
          `Failed to fetch live Stripe data for subscription ${subscription.stripe_subscription_id}: ${stripeErr.message}`
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // 3. Build response
      // ─────────────────────────────────────────────────────────────────────
      const plan = subscription.plan;
      const isTrialing = subscription.status === "trialing";

      const features = plan.Plan_Features.map((pf) => ({
        name: pf.feature.name,
        code: pf.feature.code,
        description: pf.feature.description ?? null,
      }));

      return res.status(200).json({
        success: true,
        data: {
          subscription_id: subscription.id,
          stripe_subscription_id: subscription.stripe_subscription_id,
          status: subscription.status,
          is_trialing: isTrialing,
          trial_end: stripeData.trial_end,
          next_billing_date: stripeData.current_period_end,
          cancel_at_period_end: stripeData.cancel_at_period_end,
          auto_renew: subscription.auto_renew,

          plan: {
            id: plan.id,
            name: plan.plan_name,
            description: plan.description ?? null,
            monthly_price: Number(plan.monthly_price),
            annual_price: Number(plan.annual_price),
            limits: {
              users: plan.user_limit,
              sites: plan.site_limit,
              areas: plan.area_limit,
              alerts: plan.alert_limit,
            },
            features,
          },

          payment_method: stripeData.payment_method
            ? {
              brand: stripeData.payment_method.brand,
              last4: stripeData.payment_method.last4,
              exp_month: stripeData.payment_method.exp_month,
              exp_year: stripeData.payment_method.exp_year,
            }
            : null,
        },
      });
    } catch (error) {
      logger.error("Get Subscription Details Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },


  /**
   * @description Fetches subscription details for the "Payment Confirmed" page.
   * @route GET /api/v1/subscriptions/status
   */
  getSubscriptionStatus: async (req, res) => {
    try {
      const { organization_id } = req.user;

      // 1. Get the Active Subscription + Plan Details
      const sub = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          // You might want to filter by status: 'active' if you keep history
          status: "active",
        },
        include: {
          // Assuming your relation name is 'plan' or 'Subscription_Plan' based on your schema
          // Adjust this key to match your Prisma Schema relation name!
          // Common default: subscription_plan
          // If you named the relation in schema:  plan Subscription_Plans @relation(...)
          plan: true,
        },
        orderBy: { created_at: "desc" }, // Get the most recent one
      });

      if (!sub) {
        return res
          .status(404)
          .json({ message: "No active subscription found." });
      }

      // 2. Format Data for the UI (Matching your screenshot)
      const data = {
        plan_name: sub.plan?.plan_name || "Unknown Plan",
        amount_charged: parseFloat(sub.plan?.monthly_price || 0).toFixed(2),
        billing_cycle: "Monthly", // or derive from price/interval
        payment_date: sub.current_period_start, // "December 4, 2025"
        payment_status: "Successful",

        // Next Payment Section
        next_billing_date: sub.current_period_end, // "January 3, 2026"
        next_amount: parseFloat(sub.plan?.monthly_price || 0).toFixed(2),
      };

      return res.status(200).json({ success: true, data });
    } catch (error) {
      logger.error("Get Subscription Status Error:", error);
      return res.status(500).json({ error: error.message });
    }
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/v1/subscriptions/billing-portal
  // Creates a Stripe Customer Portal session and returns the redirect URL.
  //
  // organization_id comes from req.user (set by verifyAdminAccess middleware).
  // Body:
  //   return_url  string  optional — where Stripe sends the user when done
  //                       (defaults to FRONTEND_URL/web/subscription-management)
  // ─────────────────────────────────────────────────────────────────────────────

 // ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/subscriptions/billing-portal
// organization_id comes from req.user (set by verifyAdminAccess middleware).
// Body is optional — only return_url can be passed if needed.
// ─────────────────────────────────────────────────────────────────────────────

getBillingPortalSession: async (req, res) => {
  try {
    // Safely read return_url — req.body may be undefined if no body is sent
    const return_url = req.body?.return_url ?? null;

    // organization_id and user_id decoded from JWT by verifyAdminAccess
    const { organization_id, user_id } = req.user;

    if (!organization_id) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is missing from token. Please log in again.",
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Get organization's Stripe customer ID
    // ─────────────────────────────────────────────────────────────────────
    const organization = await prisma.organizations.findUnique({
      where: { organization_id },
      select: {
        organization_id: true,
        name: true,
        stripe_customer_id: true,
      },
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found.",
      });
    }

    if (!organization.stripe_customer_id) {
      return res.status(404).json({
        success: false,
        message:
          "No billing account found for this organization. Please subscribe to a plan first.",
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Verify the customer exists in Stripe (guard against stale IDs)
    // ─────────────────────────────────────────────────────────────────────
    try {
      const customer = await stripe.customers.retrieve(
        organization.stripe_customer_id
      );

      if (customer.deleted) {
        return res.status(404).json({
          success: false,
          message: "Billing account not found. Please contact support.",
        });
      }
    } catch (stripeErr) {
      const msg = String(stripeErr?.message || "").toLowerCase();
      if (msg.includes("no such customer")) {
        return res.status(404).json({
          success: false,
          message: "Billing account not found. Please contact support.",
        });
      }
      throw stripeErr;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Create Stripe Customer Portal session
    // ─────────────────────────────────────────────────────────────────────
    const portalReturnUrl =
      return_url ||
      `${process.env.FRONTEND_URL}/web/subscription-management`;

    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: portalReturnUrl,
    });

    logger.info(
      `Billing portal session created | org: ${organization_id} | user: ${user_id} | customer: ${organization.stripe_customer_id}`
    );

    // ─────────────────────────────────────────────────────────────────────
    // 4. Return portal URL — frontend does window.location.href = url
    // ─────────────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    logger.error("Billing Portal Session Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
},
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/v1/subscriptions/manage
  // Returns full subscription details for the current organization,
  // including plan info, billing dates, payment method, and features.
  // ─────────────────────────────────────────────────────────────────────────────

  getSubscriptionDetails: async (req, res) => {
    try {
      const { organization_id } = req.query;

      if (!organization_id) {
        return res.status(400).json({
          success: false,
          message: "Organization ID is required.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 1. Find the active/trialing subscription in DB
      // ─────────────────────────────────────────────────────────────────────
      const subscription = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: { in: ["active", "trialing"] },
        },
        orderBy: { created_at: "desc" },
        include: {
          plan: {
            include: {
              Plan_Features: {
                include: {
                  feature: true,
                },
                where: {
                  is_enabled: true,
                },
              },
            },
          },
        },
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "No active subscription found for this organization.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 2. Fetch live data from Stripe — billing dates and payment method
      // ─────────────────────────────────────────────────────────────────────
      let stripeData = {
        current_period_end: subscription.current_period_end,
        payment_method: null,
        trial_end: null,
        cancel_at_period_end: false,
      };

      try {
        const stripeSub = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id,
          { expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"] }
        );

        // Next billing date — prefer Stripe's live value
        stripeData.current_period_end = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : subscription.current_period_end;

        stripeData.trial_end = stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000).toISOString()
          : null;

        stripeData.cancel_at_period_end = stripeSub.cancel_at_period_end ?? false;

        // ── Resolve payment method (check multiple locations) ──────────────
        // Priority: subscription default_pm → customer invoice default_pm → customer default_source
        let pm = null;

        if (
          stripeSub.default_payment_method &&
          typeof stripeSub.default_payment_method === "object"
        ) {
          pm = stripeSub.default_payment_method;
        } else if (
          stripeSub.customer &&
          typeof stripeSub.customer === "object" &&
          stripeSub.customer.invoice_settings?.default_payment_method
        ) {
          const invoicePm =
            stripeSub.customer.invoice_settings.default_payment_method;
          pm = typeof invoicePm === "object" ? invoicePm : null;

          if (!pm && typeof invoicePm === "string") {
            pm = await stripe.paymentMethods.retrieve(invoicePm);
          }
        }

        if (!pm && subscription.stripe_customer_id) {
          // Last resort — list the customer's payment methods
          const pmList = await stripe.paymentMethods.list({
            customer: subscription.stripe_customer_id,
            type: "card",
            limit: 1,
          });
          pm = pmList.data[0] ?? null;
        }

        if (pm?.card) {
          stripeData.payment_method = {
            brand: pm.card.brand,           // e.g. "visa"
            last4: pm.card.last4,           // e.g. "4244"
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
          };
        }
      } catch (stripeErr) {
        // Non-fatal — fall back to DB values if Stripe is unreachable
        logger.warn(
          `Failed to fetch live Stripe data for subscription ${subscription.stripe_subscription_id}: ${stripeErr.message}`
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // 3. Build response
      // ─────────────────────────────────────────────────────────────────────
      const plan = subscription.plan;
      const isTrialing = subscription.status === "trialing";

      const features = plan.Plan_Features.map((pf) => ({
        name: pf.feature.name,
        code: pf.feature.code,
        description: pf.feature.description ?? null,
      }));

      return res.status(200).json({
        success: true,
        data: {
          // ── Subscription ──────────────────────────────────────────────
          subscription_id: subscription.id,
          stripe_subscription_id: subscription.stripe_subscription_id,
          status: subscription.status,              // "active" | "trialing"
          is_trialing: isTrialing,
          trial_end: stripeData.trial_end,          // ISO string | null
          next_billing_date: stripeData.current_period_end, // ISO string
          cancel_at_period_end: stripeData.cancel_at_period_end,
          auto_renew: subscription.auto_renew,

          // ── Plan ──────────────────────────────────────────────────────
          plan: {
            id: plan.id,
            name: plan.plan_name,                   // e.g. "Growth"
            description: plan.description ?? null,
            monthly_price: Number(plan.monthly_price), // e.g. 299.99
            annual_price: Number(plan.annual_price),
            limits: {
              users: plan.user_limit,
              sites: plan.site_limit,
              areas: plan.area_limit,
              alerts: plan.alert_limit,
            },
            features,                               // enabled features list
          },

          // ── Payment ───────────────────────────────────────────────────
          payment_method: stripeData.payment_method
            ? {
              brand: stripeData.payment_method.brand,       // "visa"
              last4: stripeData.payment_method.last4,       // "4244"
              exp_month: stripeData.payment_method.exp_month,
              exp_year: stripeData.payment_method.exp_year,
            }
            : null,
        },
      });
    } catch (error) {
      logger.error("Get Subscription Details Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/v1/subscriptions/cancel
  // Cancels the organization's active subscription at period end (default)
  // or immediately if cancel_immediately: true is passed in the body.
  //
  // Body:
  //   organization_id    string   required
  //   cancel_immediately boolean  optional (default: false)
  //   reason             string   optional — logged for internal records
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/v1/subscriptions/cancel
  // organization_id comes from req.user (set by verifyAdminAccess middleware).
  //
  // Body:
  //   cancel_immediately  boolean  optional (default: false)
  //   reason              string   optional — logged in audit trail
  // ─────────────────────────────────────────────────────────────────────────────

  cancelSubscription: async (req, res) => {
    try {
      const { cancel_immediately = false, reason } = req.body;

      // organization_id and user_id are decoded from the JWT by verifyAdminAccess
      const { organization_id, user_id } = req.user;

      if (!organization_id) {
        return res.status(400).json({
          success: false,
          message: "Organization ID is missing from token. Please log in again.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 1. Find the active/trialing subscription in DB
      // ─────────────────────────────────────────────────────────────────────
      const subscription = await prisma.subscriptions.findFirst({
        where: {
          organization_id,
          status: { in: ["active", "trialing"] },
        },
        orderBy: { created_at: "desc" },
        include: {
          plan: true,
        },
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "No active subscription found for this organization.",
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 2. Check it isn't already scheduled for cancellation
      // ─────────────────────────────────────────────────────────────────────
      const existingStripeSub = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id
      );

      if (existingStripeSub.cancel_at_period_end && !cancel_immediately) {
        return res.status(409).json({
          success: false,
          message: "Subscription is already scheduled to cancel at period end.",
          data: {
            subscription_id: subscription.id,
            stripe_subscription_id: subscription.stripe_subscription_id,
            cancel_at: new Date(
              existingStripeSub.current_period_end * 1000
            ).toISOString(),
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 3. Cancel on Stripe
      //
      //    cancel_immediately = false (default, user-facing):
      //      → Sets cancel_at_period_end: true. User keeps access until
      //        billing period ends. Stripe then fires
      //        customer.subscription.deleted → webhook sets DB to "cancelled".
      //
      //    cancel_immediately = true (admin only):
      //      → Deletes subscription on Stripe right now.
      //      → Access revoked immediately. DB set to "cancelled" now.
      // ─────────────────────────────────────────────────────────────────────
      let cancelledStripeSub;

      if (cancel_immediately) {
        cancelledStripeSub = await stripe.subscriptions.cancel(
          subscription.stripe_subscription_id
        );
      } else {
        cancelledStripeSub = await stripe.subscriptions.update(
          subscription.stripe_subscription_id,
          { cancel_at_period_end: true }
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // 4. Sync DB
      // ─────────────────────────────────────────────────────────────────────
      const now = new Date();

      const updatedDbSubscription = await prisma.subscriptions.update({
        where: { id: subscription.id },
        data: {
          // If immediate: mark cancelled now.
          // If period-end: keep current status (active/trialing) —
          // the webhook will flip it to cancelled when period ends.
          status: cancel_immediately ? "cancelled" : subscription.status,
          payment_status: cancel_immediately
            ? "cancelled"
            : subscription.payment_status,
          auto_renew: false,
          updated_at: now,
        },
      });

      // ─────────────────────────────────────────────────────────────────────
      // 5. Audit log
      // ─────────────────────────────────────────────────────────────────────
      await prisma.audit_Logs
        .create({
          data: {
            action: cancel_immediately
              ? "subscription_cancelled_immediately"
              : "subscription_cancellation_scheduled",
            action_performed_by: user_id,
            action_target: subscription.id,
            old_value: JSON.stringify({
              status: subscription.status,
              auto_renew: subscription.auto_renew,
            }),
            new_value: JSON.stringify({
              status: updatedDbSubscription.status,
              auto_renew: false,
              cancel_immediately,
              reason: reason ?? null,
            }),
            action_timestamp: now,
          },
        })
        .catch((auditErr) => {
          // Non-fatal — log but don't fail the request
          logger.warn(
            "Failed to write audit log for cancellation:",
            auditErr.message
          );
        });

      // ─────────────────────────────────────────────────────────────────────
      // 6. Respond
      // ─────────────────────────────────────────────────────────────────────
      if (cancel_immediately) {
        return res.status(200).json({
          success: true,
          message: "Subscription cancelled immediately. Access has been revoked.",
          data: {
            subscription_id: updatedDbSubscription.id,
            stripe_subscription_id: subscription.stripe_subscription_id,
            status: "cancelled",
            cancelled_at: now.toISOString(),
          },
        });
      }

      const periodEnd = cancelledStripeSub.current_period_end ?? existingStripeSub.current_period_end ?? null;
      const cancelAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      return res.status(200).json({
        success: true,
        message: cancelAt
          ? `Subscription will be cancelled on ${cancelAt}. Access remains until then.`
          : "Subscription cancellation scheduled. Access remains until the billing period ends.",
        data: {
          subscription_id: updatedDbSubscription.id,
          stripe_subscription_id: subscription.stripe_subscription_id,
          status: updatedDbSubscription.status,
          cancel_at_period_end: true,
          cancel_at: cancelAt,
          plan_name: subscription.plan.plan_name,
        },
      });
    } catch (error) {
      logger.error("Cancel Subscription Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
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

  extendFreeTrial: async (req, res) => {
    try {
      const { organization_id, days } = req.body;
      const { user_id } = req.user;

      if (!organization_id || days == null) {
        return res.status(400).json({ success: false, message: "organization_id and days are required." });
      }

      const daysNum = Number(days);
      if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 90) {
        return res.status(400).json({ success: false, message: "days must be a positive integer between 1 and 90." });
      }

      const subscription = await prisma.subscriptions.findFirst({
        where: { organization_id, status: "trialing" },
        orderBy: { created_at: "desc" },
      });

      if (!subscription) {
        return res.status(404).json({ success: false, message: "No active trial subscription found for this organization." });
      }

      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

      if (stripeSub.status !== "trialing") {
        return res.status(400).json({ success: false, message: "Stripe subscription is not in trial status." });
      }

      const oldTrialEnd = stripeSub.trial_end;
      const newTrialEnd = oldTrialEnd + daysNum * 86400;

      await stripe.subscriptions.update(subscription.stripe_subscription_id, { trial_end: newTrialEnd });

      const now = new Date();
      await prisma.audit_Logs.create({
        data: {
          action: "free_trial_extended",
          action_performed_by: user_id,
          action_target: subscription.id,
          old_value: new Date(oldTrialEnd * 1000).toISOString(),
          new_value: new Date(newTrialEnd * 1000).toISOString(),
          action_timestamp: now,
        },
      }).catch((err) => logger.warn("Failed to write audit log for trial extension:", err.message));

      return res.status(200).json({
        success: true,
        data: {
          new_trial_end: new Date(newTrialEnd * 1000).toISOString(),
          days_added: daysNum,
        },
      });
    } catch (error) {
      logger.error("Extend Free Trial Error:", error);
      return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  },

  changePlan: async (req, res) => {
    try {
      const { new_plan_id, payment_method_id } = req.body;
      const { organization_id, user_id } = req.user;

      if (!new_plan_id) {
        return res.status(400).json({ success: false, message: "new_plan_id is required." });
      }

      const newPlan = await prisma.subscription_Plans.findUnique({ where: { id: new_plan_id } });

      if (!newPlan || !newPlan.stripe_price_id) {
        return res.status(404).json({ success: false, message: "Plan not found or has no Stripe price." });
      }

      const currentSub = await prisma.subscriptions.findFirst({
        where: { organization_id, status: { in: ["active", "trialing"] } },
        orderBy: { created_at: "desc" },
        include: { plan: true },
      });

      if (!currentSub) {
        return res.status(404).json({ success: false, message: "No active subscription to change." });
      }

      if (currentSub.subscription_plan_id === new_plan_id) {
        return res.status(400).json({ success: false, message: "Already on this plan." });
      }

      const stripeSub = await stripe.subscriptions.retrieve(currentSub.stripe_subscription_id);
      const existingItemId = stripeSub.items.data[0]?.id;

      if (!existingItemId) {
        return res.status(500).json({ success: false, message: "Could not find existing subscription item on Stripe." });
      }

      if (payment_method_id) {
        try {
          await stripe.paymentMethods.attach(payment_method_id, { customer: currentSub.stripe_customer_id });
        } catch (attachErr) {
          if (!String(attachErr?.message || "").toLowerCase().includes("already attached")) {
            return res.status(400).json({ success: false, message: "Failed to attach payment method.", error: attachErr.message });
          }
        }
        await stripe.customers.update(currentSub.stripe_customer_id, {
          invoice_settings: { default_payment_method: payment_method_id },
        });
      }

      const updatedStripeSub = await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
        items: [{ id: existingItemId, price: newPlan.stripe_price_id }],
        proration_behavior: "always_invoice",
      });

      const now = new Date();
      await prisma.subscriptions.update({
        where: { id: currentSub.id },
        data: { subscription_plan_id: new_plan_id, stripe_price_id: newPlan.stripe_price_id, updated_at: now },
      });

      await prisma.audit_Logs.create({
        data: {
          action: "subscription_plan_changed",
          action_performed_by: user_id,
          action_target: currentSub.id,
          old_value: currentSub.plan?.plan_name ?? currentSub.subscription_plan_id,
          new_value: newPlan.plan_name,
          action_timestamp: now,
        },
      }).catch((err) => logger.warn("Failed to write audit log for plan change:", err.message));

      return res.status(200).json({
        success: true,
        data: {
          subscription_id: currentSub.id,
          new_plan_name: newPlan.plan_name,
          status: updatedStripeSub.status,
          proration_note: "Proration invoice created immediately for plan difference.",
        },
      });
    } catch (error) {
      logger.error("Change Plan Error:", error);
      return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
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
            const normalizedPeriodEnd = normalizeUnixSecondsToUtcDateOnly(
              invoice.lines.data[0].period.end,
            ) ?? normalizeIncomingDateOnlyToUtc(utcNow());

            await prisma.subscriptions.update({
              where: { stripe_subscription_id: invoice.subscription },
              data: {
                status: "active",
                payment_status: "paid",
                current_period_end: normalizedPeriodEnd,
                updated_at: utcNow(),
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
                updated_at: utcNow(),
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
              updated_at: utcNow(),
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
