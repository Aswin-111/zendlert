/*
  Warnings:

  - A unique constraint covering the columns `[stripe_price_id]` on the table `Subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Subscriptions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(6);

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Subscriptions_stripe_price_id_key" ON "Subscriptions"("stripe_price_id");
