import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getPracticeAvailability } from "@/lib/server/practice";
import { readJsonBody } from "@/lib/server/request-json";
import { practiceAvailabilitySchema } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = practiceAvailabilitySchema.safeParse(body.payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup payload", issues: parsed.error.issues }, { status: 400 });
  }

  const availability = await getPracticeAvailability(user.id, parsed.data);
  return NextResponse.json(availability);
}
