/*
  Warnings:

  - A unique constraint covering the columns `[stripe_customer_id]` on the table `Organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Organizations" ADD COLUMN     "stripe_customer_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_stripe_customer_id_key" ON "Organizations"("stripe_customer_id");
