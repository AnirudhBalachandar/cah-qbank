import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/server/auth";
import { getDraftGeneratedQuestions } from "@/lib/server/generation/service";

export async function GET() {
  const admin = await requireApiAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const drafts = await getDraftGeneratedQuestions();
  return NextResponse.json({ drafts });
}
