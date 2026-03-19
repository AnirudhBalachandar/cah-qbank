export type WeaknessQuestionAttempt = {
  isCorrect: boolean;
};

export type WeaknessQuestionCandidate = {
  id: string;
  tagIds: string[];
  attempts: WeaknessQuestionAttempt[];
};

export function rankWeaknessQuestionCandidates(
  candidates: WeaknessQuestionCandidate[],
  topTagOrder: ReadonlyMap<string, number>,
  topTagCount: number,
) {
  return candidates
    .map((question) => {
      const attempts = question.attempts.length;
      const incorrect = question.attempts.filter((attempt) => !attempt.isCorrect).length;

      const strongestTagRank = question.tagIds
        .map((tagId) => topTagOrder.get(tagId))
        .filter((rank): rank is number => typeof rank === "number")
        .sort((a, b) => a - b)[0];

      const unseenBoost = attempts === 0 ? 2 : 0;
      const incorrectBoost = incorrect > 0 ? 1.3 : 0;
      const tagBoost =
        typeof strongestTagRank === "number" && topTagCount > 0
          ? (topTagCount - strongestTagRank) / topTagCount
          : 0;

      return {
        id: question.id,
        score: unseenBoost + incorrectBoost + tagBoost,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}
