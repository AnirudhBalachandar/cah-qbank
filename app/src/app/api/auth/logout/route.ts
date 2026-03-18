import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { sessionCookieConfig } from "@/lib/auth/session";

export async function POST() {
  const store = await cookies();
  store.set(sessionCookieConfig.name, "", {
    ...sessionCookieConfig.options,
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
