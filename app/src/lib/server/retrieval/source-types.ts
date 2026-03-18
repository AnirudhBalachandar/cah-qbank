export const INTERNAL_SOURCE_TYPES = ["pdf", "docx"] as const;
export const ALL_SOURCE_TYPES = ["pdf", "docx", "web"] as const;
export type RetrievalSourceType = (typeof ALL_SOURCE_TYPES)[number];

export function resolveRetrievalSourceTypes(input?: ReadonlyArray<RetrievalSourceType>): RetrievalSourceType[] {
  const allowed = new Set<RetrievalSourceType>(ALL_SOURCE_TYPES);
  if (!input || input.length === 0) {
    return [...INTERNAL_SOURCE_TYPES];
  }

  const normalized = input.filter((value): value is RetrievalSourceType => allowed.has(value));
  if (normalized.length === 0) {
    return [...INTERNAL_SOURCE_TYPES];
  }

  return Array.from(new Set(normalized));
}
