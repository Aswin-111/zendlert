-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'push', 'in_app');

-- AlterTable
ALTER TABLE "Notification_Recipients" ADD COLUMN     "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app';
