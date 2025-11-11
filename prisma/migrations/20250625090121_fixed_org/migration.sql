/*
  Warnings:

  - A unique constraint covering the columns `[contact_email]` on the table `Sites` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contact_phone]` on the table `Sites` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Sites_contact_email_key" ON "Sites"("contact_email");

-- CreateIndex
CREATE UNIQUE INDEX "Sites_contact_phone_key" ON "Sites"("contact_phone");
