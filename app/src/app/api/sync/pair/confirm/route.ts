import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/server/request-json";
import { confirmPairing } from "@/lib/server/sync/service";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const result = await confirmPairing(body.payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, errorCode: result.error }, { status: 400 });
  }

  return NextResponse.json(result.session, { status: 201 });
}
