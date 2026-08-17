/**
 * Spaced-repetition engine for Recallie.
 *
 * Implements the FSRS-inspired adaptive scheduler described in the project's
 * curriculum/pedagogy design docs: stability (S), difficulty (D), lapses,
 * and a rolling accuracy window drive the next review interval and a
 * child-friendly status ("on_track" | "needs_attention" | "mastered").
 *
 * Design goals (from project docs):
 * - Adaptive: intervals adjust per child and per skill based on performance + response time.
 * - Child-friendly: no "fail" language; statuses map to "Area to give more attention" in the UI.
 * - Interleaved by default: this module only owns the per-skill scheduling math;
 *   session assembly / interleaving lives in sessionBuilder.ts.
 */

export type SkillStatus = "on_track" | "needs_attention" | "mastered";

export type SkillState = {
  stabilityDays: number;
  difficulty: number; // 0 (easy) .. 1 (hard)
  lapses: number;
  reviewCount: number;
  recentAccuracy3: number | null; // rolling accuracy over ~last 3 reviews
  status: SkillStatus;
};

export type ReviewResult = {
  correct: boolean;
  attempts: number;
  hintUsed: boolean;
  responseTimeSec: number;
};

export type UpdatedSkillState = SkillState & {
  nextReviewIntervalDays: number;
};

// Tunable constants (kept close to project defaults; can vary by year level later).
const ALPHA_DIFFICULTY_DOWN = 0.1; // difficulty easing per correct, well-timed review
const BETA_DIFFICULTY_UP = 0.15; // difficulty increase per incorrect / slow review
const K_EASY = 0.4; // stability growth multiplier for strong retrieval (q >= 0.8)
const K_MEDIUM = 0.15; // stability growth multiplier for medium retrieval (0.5 <= q < 0.8)
const K_HARD = 0.6; // stability shrink multiplier for weak retrieval (q < 0.5)
const MIN_INTERVAL_DAYS = 0.5;
const MAX_INTERVAL_DAYS = 90;
const FORCE_REVIEW_THRESHOLD_Q = 0.3; // below this quality, force a near-term booster review
const FORCE_REVIEW_INTERVAL_DAYS = 1.0;

const MASTERED_MIN_STABILITY_DAYS = 30;
const MASTERED_MIN_REVIEW_COUNT = 5;
const MASTERED_MIN_RECENT_ACCURACY = 0.9;

const NEEDS_ATTENTION_MAX_STABILITY_DAYS = 7;
const NEEDS_ATTENTION_MIN_LAPSES = 2;
const NEEDS_ATTENTION_MAX_RECENT_ACCURACY = 0.7;

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Rolling accuracy over a window (default last 3 reviews), approximated
 * without storing full history: treats prevAvg as an average over `window`
 * reviews and swaps in the newest result. Good enough for status
 * thresholds; for precise history, read ReviewEvent rows instead.
 */
function updateRollingAccuracy(prevAvg: number | null, newCorrect: 0 | 1, window = 3): number {
  if (prevAvg === null) {
    return newCorrect;
  }
  const sumPrev = prevAvg * window;
  const newSum = sumPrev + newCorrect - prevAvg;
  return newSum / window;
}

/** Expected response-time band used for the speed-based quality adjustment. */
export function expectedResponseTimeRangeSec(yearLevel: number, subject: "maths" | "english"): {
  min: number;
  max: number;
} {
  // Slightly wider bands for younger years and for English (reading takes longer).
  if (yearLevel <= 2) return subject === "english" ? { min: 6, max: 30 } : { min: 5, max: 25 };
  if (yearLevel <= 4) return subject === "english" ? { min: 6, max: 25 } : { min: 5, max: 20 };
  return subject === "english" ? { min: 5, max: 25 } : { min: 4, max: 20 };
}

export function initializeSkillState(): SkillState {
  return {
    stabilityDays: 1,
    difficulty: 0.5,
    lapses: 0,
    reviewCount: 0,
    recentAccuracy3: null,
    status: "on_track",
  };
}

/**
 * Core update: given a child's current per-skill state and the outcome of
 * one review, returns the new state plus the interval (in days) until the
 * next review is due.
 */
export function updateSkillAfterReview(
  state: SkillState,
  review: ReviewResult,
  expectedRt: { min: number; max: number } = { min: 5, max: 20 }
): UpdatedSkillState {
  const { stabilityDays, difficulty, lapses, reviewCount, recentAccuracy3 } = state;
  const { correct, attempts, hintUsed, responseTimeSec } = review;

  // 1. Quality score q in [0, 1] from accuracy + a speed sanity check.
  let qAcc: number;
  if (correct && attempts === 1 && !hintUsed) {
    qAcc = 1.0;
  } else if (correct) {
    qAcc = 0.5;
  } else {
    qAcc = 0.0;
  }

  let speedAdj = 0;
  if (responseTimeSec < expectedRt.min) {
    speedAdj = -0.1; // likely guessing
  } else if (responseTimeSec > expectedRt.max) {
    speedAdj = -0.1; // likely struggling
  }

  const q = clamp(0, 1, qAcc + speedAdj);

  // 2. Difficulty update.
  let newDifficulty: number;
  if (correct && responseTimeSec <= expectedRt.max) {
    newDifficulty = Math.max(0, difficulty - ALPHA_DIFFICULTY_DOWN);
  } else {
    newDifficulty = Math.min(1, difficulty + BETA_DIFFICULTY_UP);
  }

  // 3. Stability update.
  let newStability: number;
  let newLapses = lapses;
  if (q >= 0.8) {
    newStability = stabilityDays * (1 + K_EASY * (1 - newDifficulty));
  } else if (q >= 0.5) {
    newStability = stabilityDays * (1 + K_MEDIUM);
  } else {
    newStability = stabilityDays * K_HARD;
    newLapses = lapses + 1;
  }

  // 4. Next interval, difficulty-adjusted and bounded.
  const fD = 1 - 0.5 * newDifficulty;
  let intervalDays = clamp(MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS, newStability * fD);

  // 5. Force a near-term booster review after a poor showing.
  if (q < FORCE_REVIEW_THRESHOLD_Q) {
    intervalDays = Math.min(intervalDays, FORCE_REVIEW_INTERVAL_DAYS);
  }

  // 6. Review count + rolling accuracy.
  const newReviewCount = reviewCount + 1;
  const newRecentAccuracy3 = updateRollingAccuracy(recentAccuracy3, correct ? 1 : 0, 3);

  // 7. Status classification (child/parent-facing language lives in the UI layer;
  //    this is the internal enum only).
  let newStatus: SkillStatus = "on_track";
  if (
    newStability >= MASTERED_MIN_STABILITY_DAYS &&
    newReviewCount >= MASTERED_MIN_REVIEW_COUNT &&
    newRecentAccuracy3 !== null &&
    newRecentAccuracy3 >= MASTERED_MIN_RECENT_ACCURACY
  ) {
    newStatus = "mastered";
  } else if (
    newStability <= NEEDS_ATTENTION_MAX_STABILITY_DAYS ||
    newLapses >= NEEDS_ATTENTION_MIN_LAPSES ||
    (newRecentAccuracy3 !== null && newRecentAccuracy3 < NEEDS_ATTENTION_MAX_RECENT_ACCURACY)
  ) {
    newStatus = "needs_attention";
  }

  return {
    stabilityDays: newStability,
    difficulty: newDifficulty,
    lapses: newLapses,
    reviewCount: newReviewCount,
    recentAccuracy3: newRecentAccuracy3,
    status: newStatus,
    nextReviewIntervalDays: intervalDays,
  };
}

/** Maps an internal status to the app's required child/parent-safe phrasing. */
export function statusToParentLabel(status: SkillStatus): string {
  switch (status) {
    case "mastered":
      return "Skill mastered";
    case "needs_attention":
      return "Area to give more attention";
    case "on_track":
    default:
      return "On track";
  }
}
