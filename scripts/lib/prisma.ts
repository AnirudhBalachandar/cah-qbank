import { PrismaClient } from "../../app/src/lib/generated/prisma";

declare global {
  // eslint-disable-next-line no-var
  var prismaScriptGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaScriptGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaScriptGlobal = prisma;
}
