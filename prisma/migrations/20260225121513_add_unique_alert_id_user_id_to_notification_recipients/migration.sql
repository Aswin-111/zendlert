/*
  Warnings:

  - A unique constraint covering the columns `[alert_id,user_id]` on the table `Notification_Recipients` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Notification_Recipients_alert_id_user_id_key" ON "Notification_Recipients"("alert_id", "user_id");
