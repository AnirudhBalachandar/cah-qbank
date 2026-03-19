import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/server/auth";
import { recomputeMasteryForAllUsers, recomputeMasteryForUser } from "@/lib/server/mastery";
import { readJsonBody } from "@/lib/server/request-json";

export async function POST(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }
  const payload = body.payload as { userId?: string };

  if (payload.userId) {
    await recomputeMasteryForUser(payload.userId);
    return NextResponse.json({ ok: true, scope: "user", userId: payload.userId });
  }

  await recomputeMasteryForAllUsers();
  return NextResponse.json({ ok: true, scope: "all" });
}
