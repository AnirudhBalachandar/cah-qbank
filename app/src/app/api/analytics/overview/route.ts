import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getAnalyticsOverview } from "@/lib/server/practice";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const analytics = await getAnalyticsOverview(user.id);
  return NextResponse.json(analytics);
}
