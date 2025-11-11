-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('email', 'sms', 'both');

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "must_reset_password" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "Chat_Messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "encrypted_message" TEXT NOT NULL,
    "encrypted_sym_key" TEXT NOT NULL,
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MessageStatus" NOT NULL DEFAULT 'sent',
    "read_at" TIMESTAMP(3),
    "deleted_by_sender" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by_receiver" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Chat_Messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitations" (
    "invitation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "delivery_method" "DeliveryMethod" NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitations_pkey" PRIMARY KEY ("invitation_id")
);

-- CreateIndex
CREATE INDEX "Chat_Messages_organization_id_idx" ON "Chat_Messages"("organization_id");

-- CreateIndex
CREATE INDEX "Chat_Messages_sender_id_sent_at_idx" ON "Chat_Messages"("sender_id", "sent_at");

-- CreateIndex
CREATE INDEX "Chat_Messages_receiver_id_status_sent_at_idx" ON "Chat_Messages"("receiver_id", "status", "sent_at");

-- CreateIndex
CREATE INDEX "Chat_Messages_organization_id_sender_id_receiver_id_sent_at_idx" ON "Chat_Messages"("organization_id", "sender_id", "receiver_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "Invitations_token_key" ON "Invitations"("token");

-- CreateIndex
CREATE INDEX "Invitations_organization_id_idx" ON "Invitations"("organization_id");

-- CreateIndex
CREATE INDEX "Invitations_user_id_idx" ON "Invitations"("user_id");

-- CreateIndex
CREATE INDEX "Invitations_expires_at_idx" ON "Invitations"("expires_at");

-- CreateIndex
CREATE INDEX "Invitations_is_used_expires_at_idx" ON "Invitations"("is_used", "expires_at");

-- AddForeignKey
ALTER TABLE "Chat_Messages" ADD CONSTRAINT "Chat_Messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat_Messages" ADD CONSTRAINT "Chat_Messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat_Messages" ADD CONSTRAINT "Chat_Messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
