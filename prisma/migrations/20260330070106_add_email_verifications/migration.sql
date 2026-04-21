-- CreateTable
CREATE TABLE "Email_Verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pending_email" TEXT NOT NULL,
    "verification_code" VARCHAR(6) NOT NULL,
    "code_sent_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Email_Verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_Verifications_pending_email_key" ON "Email_Verifications"("pending_email");

-- CreateIndex
CREATE INDEX "Email_Verifications_user_id_idx" ON "Email_Verifications"("user_id");

-- CreateIndex
CREATE INDEX "Email_Verifications_pending_email_idx" ON "Email_Verifications"("pending_email");

-- AddForeignKey
ALTER TABLE "Email_Verifications" ADD CONSTRAINT "Email_Verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
