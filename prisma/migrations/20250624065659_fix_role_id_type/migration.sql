/*
  Warnings:

  - The primary key for the `Alerts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `location` on the `Alerts` table. All the data in the column will be lost.
  - The `severity` column on the `Alerts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Areas` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `name` on the `Areas` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `Audit_Logs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Companies` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Emergency_Types` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Features` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Notification_Recipients` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `notification_status` on the `Notification_Recipients` table. All the data in the column will be lost.
  - You are about to drop the column `received_at` on the `Notification_Recipients` table. All the data in the column will be lost.
  - The `response` column on the `Notification_Recipients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Organizations` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `industry_type` on the `Organizations` table. All the data in the column will be lost.
  - The primary key for the `Permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Plan_Features` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Role_Permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Roles` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Sites` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `updated_at` on the `Sites` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `Sites` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `Subscription_Plans` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Subscriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User_Locations` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Users` table. All the data in the column will be lost.
  - The primary key for the `Visitor_Status` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `usersId` on the `Visitor_Status` table. All the data in the column will be lost.
  - The primary key for the `Visitors` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Incident_Reports` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[main_contact_email]` on the table `Organizations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[main_contact_phone]` on the table `Organizations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organization_id` to the `Alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `industry_type_id` to the `Organizations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status_id` to the `Organizations` table without a default value. This is not possible if the table is not empty.
  - The required column `user_id` was added to the `Users` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'ACTIVE', 'ARCHIVED', 'SUSPENDED', 'PAYMENT_FAILED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('Critical', 'High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SEND', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserResponse" AS ENUM ('SAFE', 'NOT_SAFE', 'EVACUATED', 'SEEKING_SHELTER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'high');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'resolved');

-- DropForeignKey
ALTER TABLE "Alerts" DROP CONSTRAINT "Alerts_emergency_type_id_fkey";

-- DropForeignKey
ALTER TABLE "Alerts" DROP CONSTRAINT "Alerts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Areas" DROP CONSTRAINT "Areas_site_id_fkey";

-- DropForeignKey
ALTER TABLE "Audit_Logs" DROP CONSTRAINT "Audit_Logs_action_performed_by_fkey";

-- DropForeignKey
ALTER TABLE "Incident_Reports" DROP CONSTRAINT "Incident_Reports_reported_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Incident_Reports" DROP CONSTRAINT "Incident_Reports_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "Notification_Recipients" DROP CONSTRAINT "Notification_Recipients_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "Notification_Recipients" DROP CONSTRAINT "Notification_Recipients_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Plan_Features" DROP CONSTRAINT "Plan_Features_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "Plan_Features" DROP CONSTRAINT "Plan_Features_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "Role_Permissions" DROP CONSTRAINT "Role_Permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "Role_Permissions" DROP CONSTRAINT "Role_Permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "Sites" DROP CONSTRAINT "Sites_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "User_Locations" DROP CONSTRAINT "User_Locations_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "User_Locations" DROP CONSTRAINT "User_Locations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_area_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_role_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_site_id_fkey";

-- DropForeignKey
ALTER TABLE "Visitor_Status" DROP CONSTRAINT "Visitor_Status_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "Visitor_Status" DROP CONSTRAINT "Visitor_Status_reported_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Visitor_Status" DROP CONSTRAINT "Visitor_Status_usersId_fkey";

-- DropForeignKey
ALTER TABLE "Visitor_Status" DROP CONSTRAINT "Visitor_Status_visitor_id_fkey";

-- DropForeignKey
ALTER TABLE "Visitors" DROP CONSTRAINT "Visitors_company_id_fkey";

-- DropIndex
DROP INDEX "Organizations_industry_type_key";

-- AlterTable
ALTER TABLE "Alerts" DROP CONSTRAINT "Alerts_pkey",
DROP COLUMN "location",
ADD COLUMN     "organization_StatusesId" TEXT,
ADD COLUMN     "organization_id" TEXT NOT NULL,
ADD COLUMN     "response_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scheduled_time" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "emergency_type_id" SET DATA TYPE TEXT,
DROP COLUMN "severity",
ADD COLUMN     "severity" "SeverityLevel",
ALTER COLUMN "action_required" DROP NOT NULL,
ALTER COLUMN "start_time" DROP NOT NULL,
ALTER COLUMN "end_time" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "Alerts_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Alerts_id_seq";

-- AlterTable
ALTER TABLE "Areas" DROP CONSTRAINT "Areas_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "site_id" SET DATA TYPE TEXT,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "description" DROP NOT NULL,
ADD CONSTRAINT "Areas_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Areas_id_seq";

-- AlterTable
ALTER TABLE "Audit_Logs" DROP CONSTRAINT "Audit_Logs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "action_performed_by" SET DATA TYPE TEXT,
ALTER COLUMN "action_target" DROP NOT NULL,
ADD CONSTRAINT "Audit_Logs_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Audit_Logs_id_seq";

-- AlterTable
ALTER TABLE "Companies" DROP CONSTRAINT "Companies_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "address" DROP NOT NULL,
ADD CONSTRAINT "Companies_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Companies_id_seq";

-- AlterTable
ALTER TABLE "Emergency_Types" DROP CONSTRAINT "Emergency_Types_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "description" DROP NOT NULL,
ADD CONSTRAINT "Emergency_Types_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Emergency_Types_id_seq";

-- AlterTable
ALTER TABLE "Features" DROP CONSTRAINT "Features_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Features_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Features_id_seq";

-- AlterTable
ALTER TABLE "Notification_Recipients" DROP CONSTRAINT "Notification_Recipients_pkey",
DROP COLUMN "notification_status",
DROP COLUMN "received_at",
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "response_history" JSONB,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "alert_id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "acknowledged_at" DROP NOT NULL,
DROP COLUMN "response",
ADD COLUMN     "response" "UserResponse",
ALTER COLUMN "response_updated_at" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "Notification_Recipients_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Notification_Recipients_id_seq";

-- AlterTable
ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_pkey",
DROP COLUMN "industry_type",
ADD COLUMN     "industry_type_id" TEXT NOT NULL,
ADD COLUMN     "last_activity_at" TIMESTAMP(3),
ADD COLUMN     "main_contact_email" TEXT,
ADD COLUMN     "main_contact_name" TEXT,
ADD COLUMN     "main_contact_phone" TEXT,
ADD COLUMN     "status_id" TEXT NOT NULL,
ALTER COLUMN "organization_id" DROP DEFAULT,
ALTER COLUMN "organization_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Organizations_pkey" PRIMARY KEY ("organization_id");
DROP SEQUENCE "Organizations_organization_id_seq";

-- AlterTable
ALTER TABLE "Permissions" DROP CONSTRAINT "Permissions_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Permissions_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Permissions_id_seq";

-- AlterTable
ALTER TABLE "Plan_Features" DROP CONSTRAINT "Plan_Features_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "plan_id" SET DATA TYPE TEXT,
ALTER COLUMN "feature_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Plan_Features_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Plan_Features_id_seq";

-- AlterTable
ALTER TABLE "Role_Permissions" DROP CONSTRAINT "Role_Permissions_pkey",
ALTER COLUMN "role_id" SET DATA TYPE TEXT,
ALTER COLUMN "permission_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Role_Permissions_pkey" PRIMARY KEY ("role_id", "permission_id");

-- AlterTable
ALTER TABLE "Roles" DROP CONSTRAINT "Roles_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Roles_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Roles_id_seq";

-- AlterTable
ALTER TABLE "Sites" DROP CONSTRAINT "Sites_pkey",
DROP COLUMN "updated_at",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "organization_id" SET DATA TYPE TEXT,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "address_line_2" DROP NOT NULL,
ALTER COLUMN "contact_phone" DROP NOT NULL,
ADD CONSTRAINT "Sites_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Sites_id_seq";

-- AlterTable
ALTER TABLE "Subscription_Plans" DROP CONSTRAINT "Subscription_Plans_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Subscription_Plans_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Subscription_Plans_id_seq";

-- AlterTable
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "organization_id" SET DATA TYPE TEXT,
ALTER COLUMN "plan_id" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "Subscriptions_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Subscriptions_id_seq";

-- AlterTable
ALTER TABLE "User_Locations" DROP CONSTRAINT "User_Locations_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "alert_id" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "User_Locations_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "User_Locations_id_seq";

-- AlterTable
ALTER TABLE "Users" DROP CONSTRAINT "Users_pkey",
DROP COLUMN "id",
ADD COLUMN     "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "user_id" TEXT NOT NULL,
ALTER COLUMN "organization_id" SET DATA TYPE TEXT,
ALTER COLUMN "site_id" SET DATA TYPE TEXT,
ALTER COLUMN "area_id" SET DATA TYPE TEXT,
ALTER COLUMN "role_id" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("user_id");

-- AlterTable
ALTER TABLE "Visitor_Status" DROP CONSTRAINT "Visitor_Status_pkey",
DROP COLUMN "usersId",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "alert_id" SET DATA TYPE TEXT,
ALTER COLUMN "reported_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "visitor_id" SET DATA TYPE TEXT,
ALTER COLUMN "location" DROP NOT NULL,
ALTER COLUMN "notes" DROP NOT NULL,
ADD CONSTRAINT "Visitor_Status_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Visitor_Status_id_seq";

-- AlterTable
ALTER TABLE "Visitors" DROP CONSTRAINT "Visitors_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "company_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Visitors_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Visitors_id_seq";

-- DropTable
DROP TABLE "Incident_Reports";

-- DropEnum
DROP TYPE "NotificationStatus";

-- DropEnum
DROP TYPE "Response";

-- DropEnum
DROP TYPE "Severity";

-- DropEnum
DROP TYPE "Status";

-- CreateTable
CREATE TABLE "Organization_Statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_Statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone_Verifications" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "verification_code" VARCHAR(6) NOT NULL,
    "code_sent_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "Phone_Verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert_Sites" (
    "alert_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,

    CONSTRAINT "Alert_Sites_pkey" PRIMARY KEY ("alert_id","site_id")
);

-- CreateTable
CREATE TABLE "Alert_Areas" (
    "alert_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,

    CONSTRAINT "Alert_Areas_pkey" PRIMARY KEY ("alert_id","area_id")
);

-- CreateTable
CREATE TABLE "Industry_Types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Industry_Types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_Statuses_name_key" ON "Organization_Statuses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_Types_name_key" ON "Industry_Types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_main_contact_email_key" ON "Organizations"("main_contact_email");

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_main_contact_phone_key" ON "Organizations"("main_contact_phone");

-- AddForeignKey
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_industry_type_id_fkey" FOREIGN KEY ("industry_type_id") REFERENCES "Industry_Types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "Organization_Statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sites" ADD CONSTRAINT "Sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Areas" ADD CONSTRAINT "Areas_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "Areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phone_Verifications" ADD CONSTRAINT "Phone_Verifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_emergency_type_id_fkey" FOREIGN KEY ("emergency_type_id") REFERENCES "Emergency_Types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_organization_StatusesId_fkey" FOREIGN KEY ("organization_StatusesId") REFERENCES "Organization_Statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert_Sites" ADD CONSTRAINT "Alert_Sites_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert_Sites" ADD CONSTRAINT "Alert_Sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert_Areas" ADD CONSTRAINT "Alert_Areas_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert_Areas" ADD CONSTRAINT "Alert_Areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "Areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitors" ADD CONSTRAINT "Visitors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "Visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification_Recipients" ADD CONSTRAINT "Notification_Recipients_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification_Recipients" ADD CONSTRAINT "Notification_Recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Locations" ADD CONSTRAINT "User_Locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Locations" ADD CONSTRAINT "User_Locations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role_Permissions" ADD CONSTRAINT "Role_Permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role_Permissions" ADD CONSTRAINT "Role_Permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit_Logs" ADD CONSTRAINT "Audit_Logs_action_performed_by_fkey" FOREIGN KEY ("action_performed_by") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Subscription_Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan_Features" ADD CONSTRAINT "Plan_Features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Subscription_Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan_Features" ADD CONSTRAINT "Plan_Features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "Features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
