/*
  Warnings:

  - Added the required column `contact_name` to the `Sites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_type` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserTypes" AS ENUM ('EMPLOYEE', 'CONTRACTOR');

-- AlterTable
ALTER TABLE "Sites" ADD COLUMN     "contact_name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "user_type" "UserTypes" NOT NULL;

-- CreateTable
CREATE TABLE "Employees" (
    "user_id" TEXT NOT NULL,

    CONSTRAINT "Employees_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "Contractors" (
    "user_id" TEXT NOT NULL,
    "contracting_company_id" TEXT NOT NULL,

    CONSTRAINT "Contractors_pkey" PRIMARY KEY ("user_id","contracting_company_id")
);

-- CreateTable
CREATE TABLE "Contracting_Companies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "phone" TEXT,
    "address" TEXT,

    CONSTRAINT "Contracting_Companies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Employees" ADD CONSTRAINT "Employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractors" ADD CONSTRAINT "Contractors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractors" ADD CONSTRAINT "Contractors_contracting_company_id_fkey" FOREIGN KEY ("contracting_company_id") REFERENCES "Contracting_Companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
