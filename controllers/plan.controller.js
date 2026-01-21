import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();

const PlansController = {
  getAllPlans: async (req, res) => {
    try {
      const { user_id } = req.user; // From verifyJWT

      // 1. Fetch Plans AND join the Plan_Features table
      const plans = await prisma.subscription_Plans.findMany({
        where: { is_active: true },
        orderBy: { monthly_price: 'asc' },
        include: {
          Plan_Features: {
            where: { is_enabled: true },
            include: { feature: true } // Get the actual Feature name (e.g., "Mobile Access")
          }
        }
      });

      // 2. Fetch User's Current Subscription
      // We look for an 'active' subscription linked to this user's organization
      const currentSub = await prisma.subscriptions.findFirst({
        where: { 
          organization: { Users: { some: { user_id } } },
          status: 'active'
        },
      });

      // 3. Format Data for the Frontend
      const formattedPlans = plans.map(plan => {
        const isCurrent = currentSub?.subscription_plan_id === plan.id;
        
        // --- FEATURE MERGING LOGIC ---
        const uiFeatures = [];

        // A. Hard Limits (Convert numbers to text)
        // We treat 9999 as "Unlimited" based on your seed data
        if (plan.user_limit > 0) {
            uiFeatures.push(plan.user_limit >= 9999 ? "Unlimited Users" : `Up to ${plan.user_limit} Users`);
        }
        if (plan.site_limit > 0) {
            uiFeatures.push(plan.site_limit >= 9999 ? "Unlimited Sites" : `Up to ${plan.site_limit} Sites`);
        }
        if (plan.area_limit > 0) {
             uiFeatures.push(plan.area_limit >= 9999 ? "Unlimited Areas" : `Up to ${plan.area_limit} Areas`);
        }
        if (plan.alert_limit > 0) {
             uiFeatures.push(plan.alert_limit >= 9999 ? "Unlimited Alerts" : `${plan.alert_limit} Alerts / Month`);
        }

        // B. Boolean Features (From Database Link)
        if (plan.Plan_Features) {
            plan.Plan_Features.forEach(pf => {
                uiFeatures.push(pf.feature.name); 
            });
        }

        return {
          id: plan.id,
          name: plan.plan_name,
          // Use 'description' from your schema as the tagline
          tagline: plan.description || "", 
          currency: "INR", 
          
          price: parseFloat(plan.monthly_price),
          originalPrice: null, // Add logic here if you add 'original_price' to schema later
          
          features: uiFeatures, // The combined list
          
          isCurrentPlan: isCurrent,
          renewsAt: isCurrent ? currentSub.current_period_end : null,
          stripePriceId: plan.stripe_price_id
        };
      });

      return res.status(200).json({ 
        success: true, 
        data: formattedPlans 
      });

    } catch (error) {
      logger.error("Error fetching plans:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

export default PlansController;