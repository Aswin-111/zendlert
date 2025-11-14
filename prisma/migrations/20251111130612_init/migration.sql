-- CreateTable
CREATE TABLE "Severity_Levels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Severity_Levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Severity_Levels_name_key" ON "Severity_Levels"("name");

-- CreateIndex
CREATE INDEX "Severity_Levels_organization_id_idx" ON "Severity_Levels"("organization_id");

-- AddForeignKey
ALTER TABLE "Severity_Levels" ADD CONSTRAINT "Severity_Levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
