const BASE_RATING = 1000
const K_FACTOR = 32

const difficultyRatings: Record<string, number> = {
  Basic: 920,
  Intermediate: 1000,
  Hard: 1080,
}

export function ratingForDifficulty(difficulty: string | null | undefined) {
  if (!difficulty) return BASE_RATING
  return difficultyRatings[difficulty] ?? BASE_RATING
}

export function expectedScore(playerRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400))
}

export function updateEloRating(params: {
  currentRating?: number | null
  difficulty?: string | null
  isCorrect: boolean
}) {
  const currentRating = params.currentRating ?? BASE_RATING
  const expected = expectedScore(currentRating, ratingForDifficulty(params.difficulty))
  const actual = params.isCorrect ? 1 : 0
  const nextRating = currentRating + K_FACTOR * (actual - expected)

  return {
    previousRating: currentRating,
    expected,
    nextRating: Number(nextRating.toFixed(2)),
  }
}

export { BASE_RATING }
