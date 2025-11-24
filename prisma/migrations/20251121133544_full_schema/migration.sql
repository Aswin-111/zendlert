/*
  Warnings:

  - You are about to alter the column `email_domain` on the `Organizations` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `main_contact_email` on the `Organizations` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `main_contact_name` on the `Organizations` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `main_contact_phone` on the `Organizations` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - A unique constraint covering the columns `[organization_id,name]` on the table `Emergency_Types` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[main_contact_name]` on the table `Organizations` will be added. If there are existing duplicate values, this will fail.
  - Made the column `updated_at` on table `Features` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `time_zone` to the `Organizations` table without a default value. This is not possible if the table is not empty.
  - Made the column `updated_at` on table `Plan_Features` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `Subscription_Plans` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('fire', 'chemical_spill', 'medical', 'security', 'equipment_failure', 'other');

-- DropIndex
DROP INDEX "Emergency_Types_name_key";

-- AlterTable
ALTER TABLE "Alerts" ADD COLUMN     "resolution_notes" TEXT,
ADD COLUMN     "resolution_reason_id" INTEGER,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by" TEXT;

-- AlterTable
ALTER TABLE "Features" ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "Organizations" ADD COLUMN     "time_zone" VARCHAR(100) NOT NULL,
ALTER COLUMN "email_domain" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "main_contact_email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "main_contact_name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "main_contact_phone" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "Permissions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Plan_Features" ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "Roles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription_Plans" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "Severity_Levels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Severity_Levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution_Reasons" (
    "reason_id" SERIAL NOT NULL,
    "reason_code" VARCHAR(50) NOT NULL,
    "reason_description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Resolution_Reasons_pkey" PRIMARY KEY ("reason_id")
);

-- CreateTable
CREATE TABLE "Incident_Reports" (
    "incident_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reported_by_user_id" TEXT NOT NULL,
    "incident_type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "actions_taken" TEXT,
    "status" "IncidentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_Reports_pkey" PRIMARY KEY ("incident_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Severity_Levels_name_key" ON "Severity_Levels"("name");

-- CreateIndex
CREATE INDEX "Severity_Levels_organization_id_idx" ON "Severity_Levels"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "Resolution_Reasons_reason_code_key" ON "Resolution_Reasons"("reason_code");

-- CreateIndex
CREATE INDEX "Incident_Reports_organization_id_idx" ON "Incident_Reports"("organization_id");

-- CreateIndex
CREATE INDEX "Incident_Reports_reported_by_user_id_idx" ON "Incident_Reports"("reported_by_user_id");

-- CreateIndex
CREATE INDEX "Incident_Reports_status_idx" ON "Incident_Reports"("status");

-- CreateIndex
CREATE INDEX "Incident_Reports_severity_idx" ON "Incident_Reports"("severity");

-- CreateIndex
CREATE INDEX "Alerts_organization_id_idx" ON "Alerts"("organization_id");

-- CreateIndex
CREATE INDEX "Alerts_user_id_idx" ON "Alerts"("user_id");

-- CreateIndex
CREATE INDEX "Alerts_emergency_type_id_idx" ON "Alerts"("emergency_type_id");

-- CreateIndex
CREATE INDEX "Alerts_status_idx" ON "Alerts"("status");

-- CreateIndex
CREATE INDEX "Alerts_severity_idx" ON "Alerts"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Emergency_Types_organization_id_name_key" ON "Emergency_Types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "Notification_Recipients_alert_id_idx" ON "Notification_Recipients"("alert_id");

-- CreateIndex
CREATE INDEX "Notification_Recipients_user_id_idx" ON "Notification_Recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_main_contact_name_key" ON "Organizations"("main_contact_name");

-- CreateIndex
CREATE INDEX "User_Locations_user_id_idx" ON "User_Locations"("user_id");

-- CreateIndex
CREATE INDEX "User_Locations_alert_id_idx" ON "User_Locations"("alert_id");

-- CreateIndex
CREATE INDEX "Users_organization_id_idx" ON "Users"("organization_id");

-- CreateIndex
CREATE INDEX "Users_site_id_idx" ON "Users"("site_id");

-- CreateIndex
CREATE INDEX "Users_area_id_idx" ON "Users"("area_id");

-- AddForeignKey
ALTER TABLE "Contracting_Companies" ADD CONSTRAINT "Contracting_Companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "Users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_resolution_reason_id_fkey" FOREIGN KEY ("resolution_reason_id") REFERENCES "Resolution_Reasons"("reason_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Severity_Levels" ADD CONSTRAINT "Severity_Levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident_Reports" ADD CONSTRAINT "Incident_Reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident_Reports" ADD CONSTRAINT "Incident_Reports_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
