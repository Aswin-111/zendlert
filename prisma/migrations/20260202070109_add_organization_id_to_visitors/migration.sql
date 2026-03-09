/*
  Warnings:

  - Added the required column `organization_id` to the `Visitors` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Visitors" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Visitors_organization_id_idx" ON "Visitors"("organization_id");

-- AddForeignKey
ALTER TABLE "Visitors" ADD CONSTRAINT "Visitors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
