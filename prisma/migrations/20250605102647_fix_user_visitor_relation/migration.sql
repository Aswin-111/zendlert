-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('send', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "Response" AS ENUM ('safe', 'not_safe', 'evacuated', 'seeking_shelter', 'others');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('fire', 'chemical_spill');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'high');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "Organizations" (
    "organization_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email_domain" TEXT NOT NULL,
    "industry_type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organizations_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "Sites" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Areas" (
    "id" SERIAL NOT NULL,
    "site_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "site_id" INTEGER NOT NULL,
    "area_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles" (
    "id" SERIAL NOT NULL,
    "role_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "emergency_type_id" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action_required" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emergency_Types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Emergency_Types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitors" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor_Status" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "reported_by_user_id" INTEGER NOT NULL,
    "visitor_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usersId" INTEGER,

    CONSTRAINT "Visitor_Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification_Recipients" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_status" "NotificationStatus" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL,
    "response" "Response" NOT NULL,
    "response_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_Recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User_Locations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "latitude" DECIMAL(10,6) NOT NULL,
    "longitude" DECIMAL(10,6) NOT NULL,
    "location_name" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_Locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permissions" (
    "id" SERIAL NOT NULL,
    "permission_name" TEXT NOT NULL,
    "permission_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role_Permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_Permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "Audit_Logs" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "action_performed_by" INTEGER NOT NULL,
    "action_target" TEXT NOT NULL,
    "action_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "Audit_Logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident_Reports" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "reported_by_user_id" INTEGER NOT NULL,
    "incident_type" "IncidentType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "actions_taken" TEXT,
    "status" "Status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_Reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriptions" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "payment_method" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription_Plans" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "annual_price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "user_limit" INTEGER NOT NULL DEFAULT 0,
    "site_limit" INTEGER NOT NULL DEFAULT 0,
    "area_limit" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Subscription_Plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan_Features" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "feature_id" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Plan_Features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Features" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_name_key" ON "Organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_email_domain_key" ON "Organizations"("email_domain");

-- CreateIndex
CREATE UNIQUE INDEX "Organizations_industry_type_key" ON "Organizations"("industry_type");

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_role_name_key" ON "Roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "Emergency_Types_name_key" ON "Emergency_Types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permissions_permission_name_key" ON "Permissions"("permission_name");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_Plans_name_key" ON "Subscription_Plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Features_code_key" ON "Features"("code");

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
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_emergency_type_id_fkey" FOREIGN KEY ("emergency_type_id") REFERENCES "Emergency_Types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitors" ADD CONSTRAINT "Visitors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "Visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor_Status" ADD CONSTRAINT "Visitor_Status_usersId_fkey" FOREIGN KEY ("usersId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification_Recipients" ADD CONSTRAINT "Notification_Recipients_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification_Recipients" ADD CONSTRAINT "Notification_Recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Locations" ADD CONSTRAINT "User_Locations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Locations" ADD CONSTRAINT "User_Locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role_Permissions" ADD CONSTRAINT "Role_Permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role_Permissions" ADD CONSTRAINT "Role_Permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit_Logs" ADD CONSTRAINT "Audit_Logs_action_performed_by_fkey" FOREIGN KEY ("action_performed_by") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident_Reports" ADD CONSTRAINT "Incident_Reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident_Reports" ADD CONSTRAINT "Incident_Reports_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Subscription_Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan_Features" ADD CONSTRAINT "Plan_Features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Subscription_Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan_Features" ADD CONSTRAINT "Plan_Features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "Features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
