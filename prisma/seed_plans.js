import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Subscription Plans...");

  // ============================================================
  // 1. FEATURES
  // ============================================================
  const allFeatures = [
    {
      name: "Mobile App Access",
      code: "MOBILE_ACCESS",
      description: "Access to iOS and Android mobile apps",
    },
    {
      name: "Email Support",
      code: "EMAIL_SUPPORT",
      description: "Standard email support",
    },
    {
      name: "Priority Support",
      code: "PRIORITY_SUPPORT",
      description: "24/7 dedicated priority support line",
    },
    {
      name: "Advanced Analytics",
      code: "ADV_ANALYTICS",
      description: "Deep-dive analytics and reporting across all sites",
    },
    {
      name: "Custom Branding",
      code: "CUSTOM_BRANDING",
      description: "Remove Zendlert branding and use your own logo",
    },
    {
      name: "SSO Integration",
      code: "SSO_LOGIN",
      description: "Single Sign-On (SSO) for enterprise identity providers",
    },
    {
      name: "Map View",
      code: "MAP_VIEW",
      description: "Show user locations on a live map during active alerts",
    },
  ];

  for (const feat of allFeatures) {
    await prisma.features.upsert({
      where: { code: feat.code },
      update: { name: feat.name, description: feat.description },
      create: feat,
    });
  }
  console.log("✅ Features synced.");

  // ============================================================
  // 2. PLANS
  //    Prices taken from existing seed_plans.js stripe_price_ids.
  //    Limits and descriptions updated from zendlert_Subscription_Plans.xlsx.
  //
  //    Starter   → $99.99/mo  | 50 users  | 1 site  | 3 areas  | 10 alerts/mo
  //    Growth    → $249.99/mo | 200 users | 5 sites | 15 areas | 50 alerts/mo
  //    Professional → $599.99/mo | 500+ users | 15+ sites | 50+ areas | Unlimited alerts
  //
  //    All three plans include:
  //      - Map view (show user locations during active alerts)
  //      - No advanced geofencing or site-level filtering
  //      - No SMS
  //
  //    Starter also includes a 30-day free trial (credit card required).
  // ============================================================
  const plansData = [
    {
      plan_name: "Starter",
      description:
        "Perfect for small teams getting started. Includes a 30-day free trial — credit card required, no charge until trial ends.",
      stripe_price_id: "price_1TGWUAA4PLnQSuqgHZVLBTfx",
      monthly_price: 99.99,
      annual_price: 1199.88,
      user_limit: 50,
      site_limit: 1,
      area_limit: 3,
      alert_limit: 10,
      featuresToLink: ["MOBILE_ACCESS", "EMAIL_SUPPORT", "MAP_VIEW"],
    },
    {
      plan_name: "Growth",
      description:
        "Built for growing organizations that need more users, sites, and alert capacity.",
      stripe_price_id: "price_1TGWWSA4PLnQSuqgmanY07GI",
      monthly_price: 249.99,
      annual_price: 2999.88,
      user_limit: 200,
      site_limit: 5,
      area_limit: 15,
      alert_limit: 50,
      featuresToLink: [
        "MOBILE_ACCESS",
        "EMAIL_SUPPORT",
        "PRIORITY_SUPPORT",
        "ADV_ANALYTICS",
        "MAP_VIEW",
      ],
    },
    {
      plan_name: "Professional",
      description:
        "Enterprise-grade plan for large organizations with unlimited alerts, 500+ users, and full feature access.",
      stripe_price_id: "price_1TGWY1A4PLnQSuqgXBbZDzOK",
      monthly_price: 599.99,
      annual_price: 7199.88,
      // 9999 = effectively unlimited in application logic
      user_limit: 9999,
      site_limit: 9999,
      area_limit: 9999,
      alert_limit: 9999,
      featuresToLink: [
        "MOBILE_ACCESS",
        "EMAIL_SUPPORT",
        "PRIORITY_SUPPORT",
        "ADV_ANALYTICS",
        "CUSTOM_BRANDING",
        "SSO_LOGIN",
        "MAP_VIEW",
      ],
    },
  ];

  // ============================================================
  // 3. UPSERT PLANS & LINK FEATURES
  // ============================================================
  for (const p of plansData) {
    const plan = await prisma.subscription_Plans.upsert({
      where: { plan_name: p.plan_name },
      update: {
        description: p.description,
        stripe_price_id: p.stripe_price_id,
        monthly_price: p.monthly_price,
        annual_price: p.annual_price,
        user_limit: p.user_limit,
        site_limit: p.site_limit,
        area_limit: p.area_limit,
        alert_limit: p.alert_limit,
        is_active: true,
      },
      create: {
        plan_name: p.plan_name,
        description: p.description,
        stripe_price_id: p.stripe_price_id,
        monthly_price: p.monthly_price,
        annual_price: p.annual_price,
        user_limit: p.user_limit,
        site_limit: p.site_limit,
        area_limit: p.area_limit,
        alert_limit: p.alert_limit,
        is_active: true,
      },
    });

    console.log(`🔹 Plan upserted: ${plan.plan_name}`);

    for (const code of p.featuresToLink) {
      const feature = await prisma.features.findUnique({ where: { code } });
      if (!feature) {
        console.warn(`  ⚠️  Feature not found: ${code} — skipping`);
        continue;
      }

      const exists = await prisma.plan_Features.findFirst({
        where: { plan_id: plan.id, feature_id: feature.id },
      });

      if (!exists) {
        await prisma.plan_Features.create({
          data: {
            plan_id: plan.id,
            feature_id: feature.id,
            is_enabled: true,
          },
        });
        console.log(`  ✅ Linked feature: ${code}`);
      } else {
        await prisma.plan_Features.update({
          where: { id: exists.id },
          data: { is_enabled: true },
        });
        console.log(`  🔄 Feature already linked (ensured enabled): ${code}`);
      }
    }
  }

  console.log("🚀 Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });