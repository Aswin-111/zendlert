import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Subscription System...");

  // ==========================================
  // 1. DEFINE STATIC FEATURES (Boolean Toggles)
  // ==========================================
  const allFeatures = [
    {
      name: "Mobile App Access",
      code: "MOBILE_ACCESS",
      description: "Access to iOS and Android apps",
    },
    {
      name: "Email Support",
      code: "EMAIL_SUPPORT",
      description: "Standard email support response time",
    },
    {
      name: "Priority Support",
      code: "PRIORITY_SUPPORT",
      description: "24/7 dedicated support line",
    },
    {
      name: "Advanced Analytics",
      code: "ADV_ANALYTICS",
      description: "Deep dive into site data",
    },
    {
      name: "Custom Branding",
      code: "CUSTOM_BRANDING",
      description: "Remove our logo and use yours",
    },
    {
      name: "SSO Integration",
      code: "SSO_LOGIN",
      description: "Single Sign-On for Enterprise",
    },
  ];

  // Upsert Features into DB
  for (const feat of allFeatures) {
    await prisma.features.upsert({
      where: { code: feat.code },
      update: {},
      create: feat,
    });
  }
  console.log("✅ Features synced.");

  // ==========================================
  // 2. DEFINE PLANS
  // ==========================================
  const plansData = [
    {
      // --- STARTER (Your Actual Data) ---
      plan_name: "Starter Daily",
      description: "Daily billing plan for small teams.",
      stripe_price_id: "price_1SVPf3AZY0CusegXzDOgPJyg",
      monthly_price: 30.0,
      annual_price: 300.0,

      // Hard Limits
      user_limit: 5,
      site_limit: 1,
      area_limit: 5,
      alert_limit: 100,

      // Features to Link (Codes from above)
      featuresToLink: ["MOBILE_ACCESS", "EMAIL_SUPPORT"],
    },
    {
      // --- PRO (Mid-Tier) ---
      plan_name: "Professional Plan",
      description: "Perfect for growing businesses.",
      stripe_price_id: "price_1SVPgmAZY0CusegXolBApOMg", // <--- REPLACE
      monthly_price: 599.0,
      annual_price: 990.0,

      // Hard Limits (Higher)
      user_limit: 20,
      site_limit: 5,
      area_limit: 20,
      alert_limit: 1000,

      // Features: Starter + Priority + Analytics
      featuresToLink: [
        "MOBILE_ACCESS",
        "EMAIL_SUPPORT",
        "PRIORITY_SUPPORT",
        "ADV_ANALYTICS",
      ],
    },
    {
      // --- Growth plan (Top-Tier) ---
      plan_name: "Growth plan",
      description: "Full control for large organizations.",
      stripe_price_id: "price_1SVPfwAZY0CusegXJufRLjgW", // <--- REPLACE
      monthly_price: 299.99,
      annual_price: 4990.0,

      // Hard Limits (Use 9999 for "Unlimited" logic in Controller)
      user_limit: 9999,
      site_limit: 9999,
      area_limit: 9999,
      alert_limit: 9999,

      // Features: All
      featuresToLink: [
        "MOBILE_ACCESS",
        "EMAIL_SUPPORT",
        "PRIORITY_SUPPORT",
        "ADV_ANALYTICS",
        "CUSTOM_BRANDING",
        "SSO_LOGIN",
      ],
    },
  ];

  // ==========================================
  // 3. INSERT PLANS & LINK FEATURES
  // ==========================================
  for (const p of plansData) {
    // 1. Create/Update Plan
    const plan = await prisma.subscription_Plans.upsert({
      where: { plan_name: p.plan_name },
      update: {
        stripe_price_id: p.stripe_price_id,
        monthly_price: p.monthly_price,
        user_limit: p.user_limit,
        site_limit: p.site_limit,
        area_limit: p.area_limit,
        alert_limit: p.alert_limit,
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

    console.log(`🔹 Plan Processed: ${plan.plan_name}`);

    // 2. Link Features
    for (const code of p.featuresToLink) {
      // Find feature ID
      const feature = await prisma.features.findUnique({ where: { code } });

      if (feature) {
        // Link them
        await prisma.plan_Features
          .upsert({
            where: {
              // Composite ID check isn't standard in prisma functions,
              // so we use findFirst -> create logic or a workaround.
              // Since we don't have a @@unique on (plan_id, feature_id),
              // we use findFirst logic inside the loop or just createMany with skipDuplicates if supported.
              // But for seeding, simpler is better:
              id: "temp_skip", // This line is just to satisfy syntax, see real logic below
            },
            update: {}, // Do nothing if exists
            create: {
              plan_id: plan.id,
              feature_id: feature.id,
              is_enabled: true,
            },
          })
          .catch(async (e) => {
            // Fallback if upsert fails on ID or logic: Manual Find & Create
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
            }
          });
      }
    }
  }

  console.log("🚀 Seeding Complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
