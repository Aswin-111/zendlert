/*
  Warnings:

  - The values [PENDING,SEND,DELIVERED,FAILED] on the enum `DeliveryStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [PENDING,ACTIVE,ARCHIVED,SUSPENDED,PAYMENT_FAILED,TERMINATED] on the enum `OrgStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [Critical,High,Medium,Low] on the enum `SeverityLevel` will be removed. If these variants are still used in the database, this will fail.
  - The values [SAFE,NOT_SAFE,EVACUATED,SEEKING_SHELTER] on the enum `UserResponse` will be removed. If these variants are still used in the database, this will fail.
  - The values [EMPLOYEE,CONTRACTOR] on the enum `UserTypes` will be removed. If these variants are still used in the database, this will fail.
  - The `status` column on the `Alerts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `organization_id` on table `Emergency_Types` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('draft', 'scheduled', 'active', 'resolved', 'cancelled');

-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryStatus_new" AS ENUM ('pending', 'send', 'delivered', 'failed');
ALTER TABLE "Notification_Recipients" ALTER COLUMN "delivery_status" DROP DEFAULT;
ALTER TABLE "Notification_Recipients" ALTER COLUMN "delivery_status" TYPE "DeliveryStatus_new" USING ("delivery_status"::text::"DeliveryStatus_new");
ALTER TYPE "DeliveryStatus" RENAME TO "DeliveryStatus_old";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
DROP TYPE "DeliveryStatus_old";
ALTER TABLE "Notification_Recipients" ALTER COLUMN "delivery_status" SET DEFAULT 'pending';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrgStatus_new" AS ENUM ('pending', 'active', 'archived', 'suspended', 'payment_failed', 'terminated');
ALTER TYPE "OrgStatus" RENAME TO "OrgStatus_old";
ALTER TYPE "OrgStatus_new" RENAME TO "OrgStatus";
DROP TYPE "OrgStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SeverityLevel_new" AS ENUM ('critical', 'high', 'medium', 'low');
ALTER TABLE "Alerts" ALTER COLUMN "severity" TYPE "SeverityLevel_new" USING ("severity"::text::"SeverityLevel_new");
ALTER TYPE "SeverityLevel" RENAME TO "SeverityLevel_old";
ALTER TYPE "SeverityLevel_new" RENAME TO "SeverityLevel";
DROP TYPE "SeverityLevel_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserResponse_new" AS ENUM ('safe', 'not_safe', 'evacuated', 'seeking_shelter');
ALTER TABLE "Notification_Recipients" ALTER COLUMN "response" TYPE "UserResponse_new" USING ("response"::text::"UserResponse_new");
ALTER TYPE "UserResponse" RENAME TO "UserResponse_old";
ALTER TYPE "UserResponse_new" RENAME TO "UserResponse";
DROP TYPE "UserResponse_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserTypes_new" AS ENUM ('employee', 'contractor');
ALTER TABLE "Users" ALTER COLUMN "user_type" TYPE "UserTypes_new" USING ("user_type"::text::"UserTypes_new");
ALTER TYPE "UserTypes" RENAME TO "UserTypes_old";
ALTER TYPE "UserTypes_new" RENAME TO "UserTypes";
DROP TYPE "UserTypes_old";
COMMIT;

-- AlterTable
ALTER TABLE "Alerts" DROP COLUMN "status",
ADD COLUMN     "status" "AlertStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Emergency_Types" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification_Recipients" ALTER COLUMN "delivery_status" SET DEFAULT 'pending';
