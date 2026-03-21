-- CreateTable
CREATE TABLE "Device_Key_Transfers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requesting_device_id" TEXT NOT NULL,
    "ephemeral_public_key" TEXT NOT NULL,
    "approving_device_public_key" TEXT,
    "wrapped_private_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_Key_Transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server_Sealed_Key_Backups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sealed_blob" TEXT NOT NULL,
    "key_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_Sealed_Key_Backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_Key_Transfers_user_id_idx" ON "Device_Key_Transfers"("user_id");

-- CreateIndex
CREATE INDEX "Device_Key_Transfers_status_idx" ON "Device_Key_Transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Server_Sealed_Key_Backups_user_id_key" ON "Server_Sealed_Key_Backups"("user_id");

-- AddForeignKey
ALTER TABLE "Device_Key_Transfers" ADD CONSTRAINT "Device_Key_Transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server_Sealed_Key_Backups" ADD CONSTRAINT "Server_Sealed_Key_Backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
