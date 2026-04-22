import { PrismaClient } from "@prisma/client"

declare global {
  var __cahPrisma: PrismaClient | undefined
}

export const prisma = globalThis.__cahPrisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalThis.__cahPrisma = prisma
}
