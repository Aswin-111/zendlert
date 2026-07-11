-- AlterTable
ALTER TABLE "Alerts" ADD COLUMN     "icon_id" TEXT;

-- CreateIndex
CREATE INDEX "Alerts_icon_id_idx" ON "Alerts"("icon_id");

-- AddForeignKey
ALTER TABLE "Alerts" ADD CONSTRAINT "Alerts_icon_id_fkey" FOREIGN KEY ("icon_id") REFERENCES "Icons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
