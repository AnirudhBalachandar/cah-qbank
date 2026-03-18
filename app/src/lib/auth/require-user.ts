import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { sessionCookieConfig, verifySession } from "@/lib/auth/session";
import { appUserSelect, getSingleUserFallbackUser } from "@/lib/auth/single-user";

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(sessionCookieConfig.name)?.value;
  if (!token) {
    return getSingleUserFallbackUser();
  }

  const session = await verifySession(token);
  if (!session) {
    return getSingleUserFallbackUser();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: appUserSelect,
  });

  if (user) {
    return user;
  }

  return getSingleUserFallbackUser();
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
}
