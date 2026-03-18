export type TagPerformance = {
  tagId: string;
  tagName: string;
  attempts: number;
  lastAttemptAt: Date | null;
  masteryScore: number;
  moduleWeight?: number;
};

export type WeaknessScore = TagPerformance & {
  weaknessScore: number;
  lowMastery: number;
  recencyWeight: number;
  confidencePenalty: number;
};

export function calculateWeaknessScores(input: TagPerformance[], now = new Date()): WeaknessScore[] {
  return input
    .map((item) => {
      const daysSinceLastAttempt = item.lastAttemptAt
        ? Math.max(0, (now.getTime() - item.lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24))
        : 365;

      const lowMastery = 1 - item.masteryScore;
      const recencyWeight = Math.exp(-daysSinceLastAttempt / 21);
      const confidencePenalty = item.attempts < 5 ? ((5 - item.attempts) / 5) * 0.25 : 0;
      const importanceWeight = item.moduleWeight ?? 0;

      const weaknessScore =
        lowMastery * 0.65 +
        recencyWeight * 0.2 +
        importanceWeight * 0.1 +
        confidencePenalty * 0.05;

      return {
        ...item,
        lowMastery,
        recencyWeight,
        confidencePenalty,
        weaknessScore,
      };
    })
    .sort(
      (a, b) =>
        b.weaknessScore - a.weaknessScore ||
        b.attempts - a.attempts ||
        a.tagName.localeCompare(b.tagName) ||
        a.tagId.localeCompare(b.tagId),
    );
}

export function getRecommendedWeaknessMix() {
  return {
    weakTagsPortion: 0.6,
    retentionPortion: 0.4,
  };
}
