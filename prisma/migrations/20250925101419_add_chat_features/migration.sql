-- DropIndex
DROP INDEX "Chat_Messages_organization_id_sender_id_receiver_id_sent_at_idx";

-- DropIndex
DROP INDEX "Chat_Messages_receiver_id_status_sent_at_idx";

-- DropIndex
DROP INDEX "Chat_Messages_sender_id_sent_at_idx";

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "e2ee_public_key" TEXT;

-- DropEnum
DROP TYPE "IncidentType";

-- CreateIndex
CREATE INDEX "Chat_Messages_sender_id_idx" ON "Chat_Messages"("sender_id");

-- CreateIndex
CREATE INDEX "Chat_Messages_receiver_id_idx" ON "Chat_Messages"("receiver_id");
