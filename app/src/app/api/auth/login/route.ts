import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { sessionCookieConfig, signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/server/request-json";
import { loginSchema } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  try {
    const payload = body.payload;
    const parsed = loginSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials payload." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await signSession({ sub: user.id, email: user.email, role: user.role });
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieConfig.name, token, sessionCookieConfig.options);

    return NextResponse.json({ ok: true, needsOnboarding: !user.onboardingCompletedAt });
  } catch (error) {
    console.error("[auth/login] backend error", error);
    return NextResponse.json(
      { error: "Unable to sign in.", errorCode: "AUTH_BACKEND_UNAVAILABLE" },
      { status: 500 },
    );
  }
}
