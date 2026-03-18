import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeDb = url.searchParams.get("db") === "1";

  if (!includeDb) {
    return NextResponse.json({ ok: true, app: "cah-qbank" });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, app: "cah-qbank", db: { ok: true } });
  } catch {
    return NextResponse.json({ ok: true, app: "cah-qbank", db: { ok: false } });
  }
}
