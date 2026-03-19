import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { sessionCookieConfig, verifySession } from "@/lib/auth/session";
import { appUserSelect, getSingleUserFallbackUser } from "@/lib/auth/single-user";

export async function requireApiUser() {
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

export async function requireApiAdmin() {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}
