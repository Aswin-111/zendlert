-- DropForeignKey
ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_status_id_fkey";

-- AlterTable
ALTER TABLE "Organizations" ALTER COLUMN "status_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "Organization_Statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
