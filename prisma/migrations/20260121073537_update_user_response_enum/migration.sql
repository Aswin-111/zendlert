/*
  Warnings:

  - The values [not_safe,evacuated,seeking_shelter] on the enum `UserResponse` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserResponse_new" AS ENUM ('safe', 'need_help', 'emergency_help_needed');
ALTER TABLE "Notification_Recipients" ALTER COLUMN "response" TYPE "UserResponse_new" USING ("response"::text::"UserResponse_new");
ALTER TYPE "UserResponse" RENAME TO "UserResponse_old";
ALTER TYPE "UserResponse_new" RENAME TO "UserResponse";
DROP TYPE "public"."UserResponse_old";
COMMIT;

-- DropIndex
DROP INDEX "Subscriptions_stripe_price_id_key";
