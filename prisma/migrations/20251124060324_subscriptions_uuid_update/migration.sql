/*
  Warnings:

  - You are about to drop the column `name` on the `Subscription_Plans` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `Subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `Subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Subscriptions` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `Subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `payment_method` on the `Subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `payment_status` on the `Subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - A unique constraint covering the columns `[plan_name]` on the table `Subscription_Plans` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_price_id]` on the table `Subscription_Plans` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_customer_id]` on the table `Subscriptions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_subscription_id]` on the table `Subscriptions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_price_id]` on the table `Subscriptions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `plan_name` to the `Subscription_Plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripe_price_id` to the `Subscription_Plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_end` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_start` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripe_customer_id` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripe_price_id` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripe_subscription_id` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subscription_plan_id` to the `Subscriptions` table without a default value. This is not possible if the table is not empty.
  - Made the column `organization_id` on table `Subscriptions` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_plan_id_fkey";

-- DropIndex
DROP INDEX "Subscription_Plans_name_key";

-- AlterTable
ALTER TABLE "Subscription_Plans" DROP COLUMN "name",
ADD COLUMN     "alert_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plan_name" VARCHAR(50) NOT NULL,
ADD COLUMN     "stripe_price_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Subscriptions" DROP COLUMN "end_date",
DROP COLUMN "plan_id",
DROP COLUMN "start_date",
ADD COLUMN     "current_period_end" DATE NOT NULL,
ADD COLUMN     "current_period_start" DATE NOT NULL,
ADD COLUMN     "stripe_customer_id" TEXT NOT NULL,
ADD COLUMN     "stripe_price_id" TEXT NOT NULL,
ADD COLUMN     "stripe_subscription_id" TEXT NOT NULL,
ADD COLUMN     "subscription_plan_id" TEXT NOT NULL,
ALTER COLUMN "organization_id" SET NOT NULL,
ALTER COLUMN "status" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "payment_method" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "payment_status" SET DATA TYPE VARCHAR(50);

-- CreateIndex
CREATE INDEX "Plan_Features_plan_id_idx" ON "Plan_Features"("plan_id");

-- CreateIndex
CREATE INDEX "Plan_Features_feature_id_idx" ON "Plan_Features"("feature_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_Plans_plan_name_key" ON "Subscription_Plans"("plan_name");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_Plans_stripe_price_id_key" ON "Subscription_Plans"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriptions_stripe_customer_id_key" ON "Subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriptions_stripe_subscription_id_key" ON "Subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriptions_stripe_price_id_key" ON "Subscriptions"("stripe_price_id");

-- CreateIndex
CREATE INDEX "Subscriptions_organization_id_idx" ON "Subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "Subscriptions_subscription_plan_id_idx" ON "Subscriptions"("subscription_plan_id");

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "Subscription_Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
