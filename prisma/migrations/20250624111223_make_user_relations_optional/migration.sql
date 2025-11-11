-- DropForeignKey
ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_industry_type_id_fkey";

-- DropForeignKey
ALTER TABLE "Sites" DROP CONSTRAINT "Sites_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Subscriptions" DROP CONSTRAINT "Subscriptions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_organization_id_fkey";

-- AlterTable
ALTER TABLE "Organizations" ALTER COLUMN "industry_type_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Sites" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subscriptions" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Users" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_industry_type_id_fkey" FOREIGN KEY ("industry_type_id") REFERENCES "Industry_Types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sites" ADD CONSTRAINT "Sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE SET NULL ON UPDATE CASCADE;
