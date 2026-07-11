/*
  Warnings:

  - You are about to drop the column `icon_id` on the `Alerts` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `Emergency_Types` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Alerts" DROP CONSTRAINT "Alerts_icon_id_fkey";

-- DropIndex
DROP INDEX "Alerts_icon_id_idx";

-- AlterTable
ALTER TABLE "Alerts" DROP COLUMN "icon_id";

-- AlterTable
ALTER TABLE "Emergency_Types" DROP COLUMN "image_url",
ADD COLUMN     "icon_id" TEXT;

-- CreateIndex
CREATE INDEX "Emergency_Types_icon_id_idx" ON "Emergency_Types"("icon_id");

-- AddForeignKey
ALTER TABLE "Emergency_Types" ADD CONSTRAINT "Emergency_Types_icon_id_fkey" FOREIGN KEY ("icon_id") REFERENCES "Icons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
