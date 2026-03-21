-- CreateTable
CREATE TABLE "User_Key_Backups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "kdf_salt" VARCHAR(64) NOT NULL,
    "kdf_iterations" INTEGER NOT NULL DEFAULT 310000,
    "kdf_algorithm" TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_Key_Backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User_Devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "fcm_token" TEXT,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_Devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_Key_Backups_user_id_key" ON "User_Key_Backups"("user_id");

-- CreateIndex
CREATE INDEX "User_Key_Backups_user_id_idx" ON "User_Key_Backups"("user_id");

-- CreateIndex
CREATE INDEX "User_Devices_user_id_idx" ON "User_Devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_Devices_user_id_device_id_key" ON "User_Devices"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "User_Key_Backups" ADD CONSTRAINT "User_Key_Backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Devices" ADD CONSTRAINT "User_Devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
