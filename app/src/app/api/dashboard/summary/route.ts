import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getDashboardSummary } from "@/lib/server/practice";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getDashboardSummary(user.id);
  return NextResponse.json(summary);
}
