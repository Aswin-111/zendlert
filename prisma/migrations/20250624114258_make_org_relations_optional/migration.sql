-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_area_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_role_id_fkey";

-- DropForeignKey
ALTER TABLE "Users" DROP CONSTRAINT "Users_site_id_fkey";

-- AlterTable
ALTER TABLE "Users" ALTER COLUMN "site_id" DROP NOT NULL,
ALTER COLUMN "area_id" DROP NOT NULL,
ALTER COLUMN "role_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "Areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
