-- AlterTable
ALTER TABLE "Emergency_Types" ADD COLUMN     "organization_id" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Emergency_Types_organization_id_idx" ON "Emergency_Types"("organization_id");

-- AddForeignKey
ALTER TABLE "Emergency_Types" ADD CONSTRAINT "Emergency_Types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
