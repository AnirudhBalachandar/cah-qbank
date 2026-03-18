import { prisma } from "@/lib/db";
import { isSingleUserModeEnabled } from "@/lib/auth/single-user-mode";

export const appUserSelect = {
  id: true,
  email: true,
  role: true,
  examDate: true,
  dailyTarget: true,
  defaultGenerationStrictness: true,
  onboardingCompletedAt: true,
  createdAt: true,
} as const;

export async function getSingleUserFallbackUser() {
  if (!isSingleUserModeEnabled()) {
    return null;
  }

  const preferredEmail = process.env.DEV_USER_EMAIL?.trim();
  if (preferredEmail) {
    const preferred = await prisma.user.findFirst({
      where: { email: { equals: preferredEmail, mode: "insensitive" } },
      select: appUserSelect,
    });
    if (preferred) {
      return preferred;
    }
  }

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: appUserSelect,
  });
}
