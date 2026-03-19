const DECAY_HALF_LIFE_DAYS = 45;
const BASE_ALPHA = 1;
const BASE_BETA = 1;

function getDecayFactor(days: number) {
  if (days <= 0) return 1;
  return Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS);
}

function daysBetween(older: Date, newer: Date) {
  return Math.max(0, (newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24));
}

export function applyDecay(alpha: number, beta: number, lastUpdatedAt: Date, now = new Date()) {
  const factor = getDecayFactor(daysBetween(lastUpdatedAt, now));
  return {
    alpha: BASE_ALPHA + (alpha - BASE_ALPHA) * factor,
    beta: BASE_BETA + (beta - BASE_BETA) * factor,
  };
}

export function confidenceWeight(confidence?: number | null) {
  if (!confidence || confidence < 1 || confidence > 3) return 1;
  if (confidence === 1) return 0.9; // unsure
  if (confidence === 2) return 1.0; // average
  return 1.1; // confident
}
