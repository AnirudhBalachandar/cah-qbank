import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { readJsonBody } from "@/lib/server/request-json";
import { createPairingStart } from "@/lib/server/sync/service";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const result = await createPairingStart(user.id, body.payload);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Invalid pairing start payload",
        errorCode: result.error,
        issues: "issues" in result ? result.issues : undefined,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(result.pairing, { status: 201 });
}
