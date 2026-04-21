-- DropIndex
DROP INDEX "Subscriptions_stripe_customer_id_key";

-- DropIndex
DROP INDEX "Subscriptions_stripe_price_id_key";

-- CreateIndex
CREATE INDEX "Subscriptions_stripe_customer_id_idx" ON "Subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "Subscriptions_stripe_price_id_idx" ON "Subscriptions"("stripe_price_id");
