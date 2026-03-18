import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/server/auth";
import { moderateGeneratedDraft } from "@/lib/server/generation/service";
import { readJsonBody } from "@/lib/server/request-json";
import { generatedPublishSchema } from "@/lib/server/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireApiAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = generatedPublishSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.action !== "publish") {
    return NextResponse.json({ error: "Action must be publish" }, { status: 400 });
  }

  try {
    const result = await moderateGeneratedDraft({
      itemId: id,
      action: "publish",
      reviewerNotes: parsed.data.reviewerNotes,
    });

    if (!result) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to publish draft" },
      { status: 400 },
    );
  }
}
