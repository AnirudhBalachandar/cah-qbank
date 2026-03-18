import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { startPracticeSession } from "@/lib/server/practice";
import { readJsonBody } from "@/lib/server/request-json";
import { practiceSetupSchema } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = practiceSetupSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup payload", issues: parsed.error.issues }, { status: 400 });
  }

  const session = await startPracticeSession(user.id, parsed.data);
  if (!session) {
    return NextResponse.json({ error: "No questions matched your filters." }, { status: 404 });
  }

  return NextResponse.json(session);
}
