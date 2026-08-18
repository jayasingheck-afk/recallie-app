/**
 * Gamification: points, daily streak, and badges — per the project's MVP
 * scope ("Points per correct item, daily streaks, simple badges... child-
 * friendly language focused on effort and growth").
 *
 * Deliberately stateless: everything here is derived from existing
 * ReviewEvent/Session rows rather than stored as separate mutable counters,
 * so there's nothing to keep in sync and no migration needed. If this ever
 * gets too slow at scale, the aggregates below are straightforward to
 * materialize into a summary table later without changing the badge rules.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { reviewEvents, sessions, skills } from "@/db/schema";

export const POINTS_CORRECT_NO_HINT = 10;
export const POINTS_CORRECT_WITH_HINT = 5;

export function pointsForAnswer(correct: boolean, hintUsed: boolean): number {
  if (!correct) return 0;
  return hintUsed ? POINTS_CORRECT_WITH_HINT : POINTS_CORRECT_NO_HINT;
}

export type GamificationStats = {
  totalPoints: number;
  totalCorrect: number;
  totalAnswered: number;
  currentStreakDays: number;
  totalSessionsCompleted: number;
  correctBySubject: Record<string, number>;
};

export type Badge = {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
};

type BadgeDef = Omit<Badge, "earned"> & { check: (s: GamificationStats) => boolean };

const BADGE_CATALOG: BadgeDef[] = [
  {
    key: "first_steps",
    emoji: "🐣",
    label: "First Steps",
    description: "Answer your very first question",
    check: (s) => s.totalAnswered >= 1,
  },
  {
    key: "mission_complete",
    emoji: "🎯",
    label: "Mission Complete",
    description: "Finish a full practice session",
    check: (s) => s.totalSessionsCompleted >= 1,
  },
  {
    key: "streak_3",
    emoji: "🔥",
    label: "3-Day Streak",
    description: "Practise 3 days in a row",
    check: (s) => s.currentStreakDays >= 3,
  },
  {
    key: "streak_7",
    emoji: "🌟",
    label: "7-Day Streak",
    description: "Practise 7 days in a row",
    check: (s) => s.currentStreakDays >= 7,
  },
  {
    key: "number_ninja",
    emoji: "🔢",
    label: "Number Ninja",
    description: "Get 25 Maths questions correct",
    check: (s) => (s.correctBySubject["maths"] ?? 0) >= 25,
  },
  {
    key: "word_wizard",
    emoji: "📖",
    label: "Word Wizard",
    description: "Get 25 English questions correct",
    check: (s) => (s.correctBySubject["english"] ?? 0) >= 25,
  },
  {
    key: "century_club",
    emoji: "💯",
    label: "Century Club",
    description: "Get 100 questions correct in total",
    check: (s) => s.totalCorrect >= 100,
  },
];

/** Consecutive calendar days (ending today or yesterday) with at least one review. */
function computeStreak(reviewDates: Date[], now: Date): number {
  if (reviewDates.length === 0) return 0;

  const daySet = new Set(
    reviewDates.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  );

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // If nothing today yet, a streak can still be "alive" through yesterday —
  // don't zero it out just because the child hasn't practised *today* yet.
  if (!daySet.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!daySet.has(key(cursor))) return 0;
  }

  let streak = 0;
  while (daySet.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function computeGamificationStats(childId: string, now: Date = new Date()): Promise<GamificationStats> {
  const reviews = await db
    .select({ review: reviewEvents, subject: skills.subject })
    .from(reviewEvents)
    .innerJoin(skills, eq(reviewEvents.skillId, skills.id))
    .where(eq(reviewEvents.childId, childId));

  let totalPoints = 0;
  let totalCorrect = 0;
  const correctBySubject: Record<string, number> = {};

  for (const { review, subject } of reviews) {
    if (review.correct) {
      totalCorrect++;
      correctBySubject[subject] = (correctBySubject[subject] ?? 0) + 1;
    }
    totalPoints += pointsForAnswer(review.correct, review.hintUsed);
  }

  const completedSessions = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.childId, childId), eq(sessions.status, "completed")));

  const currentStreakDays = computeStreak(
    reviews.map((r) => r.review.timestamp),
    now
  );

  return {
    totalPoints,
    totalCorrect,
    totalAnswered: reviews.length,
    currentStreakDays,
    totalSessionsCompleted: completedSessions.length,
    correctBySubject,
  };
}

export function computeBadges(stats: GamificationStats): Badge[] {
  return BADGE_CATALOG.map((b) => ({
    key: b.key,
    emoji: b.emoji,
    label: b.label,
    description: b.description,
    earned: b.check(stats),
  }));
}

export async function getGamificationSummary(childId: string, now: Date = new Date()) {
  const stats = await computeGamificationStats(childId, now);
  const badges = computeBadges(stats);
  return { stats, badges };
}
