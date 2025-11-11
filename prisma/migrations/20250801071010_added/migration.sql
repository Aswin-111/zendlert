/*
  Warnings:

  - You are about to drop the column `token` on the `Users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Users" DROP COLUMN "token",
ADD COLUMN     "fcm_token" TEXT,
ADD COLUMN     "profile_pic" TEXT;
