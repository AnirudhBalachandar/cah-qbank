import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getGenerationRun } from "@/lib/server/generation/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const run = await getGenerationRun(user.id, id);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
