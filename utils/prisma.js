import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__zendlertPrismaClient || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__zendlertPrismaClient = prisma;
}

export default prisma;
