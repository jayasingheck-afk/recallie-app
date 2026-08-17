/**
 * Per-year-level session sizing defaults, from the project's session-builder
 * design doc. Item counts are indicative targets for the item-slot
 * allocation in sessionBuilder.ts; actual sessions may be shorter if the
 * candidate pool (due reviews + new + mixed) is smaller.
 */
export type YearLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const YEAR_CONFIG: Record<YearLevel, { targetMinutes: number; items: number }> = {
  1: { targetMinutes: 17, items: 14 },
  2: { targetMinutes: 18, items: 16 },
  3: { targetMinutes: 22, items: 20 },
  4: { targetMinutes: 24, items: 22 },
  5: { targetMinutes: 28, items: 26 },
  6: { targetMinutes: 32, items: 30 },
};

// Session composition ratios (by item count), from the session-builder doc:
// ~40% review, ~35% new learning, ~25% mixed/interleaved practice.
export const SESSION_COMPOSITION = {
  review: 0.4,
  new: 0.35,
  mixed: 0.25,
};

export function getYearConfig(yearLevel: number) {
  const clamped = Math.min(6, Math.max(1, yearLevel)) as YearLevel;
  return YEAR_CONFIG[clamped];
}
