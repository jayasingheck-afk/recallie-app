/**
 * Monthly parent progress report — per the project's MVP scope ("Progress
 * dashboard: ... Displays recent sessions and a simple monthly progress
 * report"). Generation + an in-app/printable view only for now; emailing it
 * out is a separate next step that needs an email service.
 *
 * Design note: ChildSkillState has no history table, so "skills mastered"
 * and "areas to give more attention" here are always a *current* snapshot,
 * not "as they stood at the end of the reporting month" — labelled as such
 * in the UI. Points/streak/badges, by contrast, ARE reconstructable at any
 * past instant because they're pure functions of timestamped ReviewEvent
 * rows (see gamification.ts's `asOf` parameter) — used below to detect which
 * badges were newly earned during the reporting month specifically.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { childSkillStates, reviewEvents, sessions, skills } from "@/db/schema";
import { computeGamificationStats, computeBadges, pointsForAnswer, type Badge } from "./gamification";
import { statusToParentLabel } from "./spacedRepetition";

export type MonthlyReport = {
  period: {
    year: number;
    month: number; // 1-12
    label: string; // e.g. "August 2026"
    isCurrentMonth: boolean;
    daysElapsed: number; // days counted so far (full month, or up to today if it's the current month)
    daysInMonth: number;
  };
  practice: {
    sessionsCompleted: number;
    itemsAnswered: number;
    itemsCorrect: number;
    accuracyPct: number | null;
    practiceDays: number;
    pointsEarned: number;
    bySubject: Record<string, { answered: number; correct: number }>;
  };
  badgesEarnedThisMonth: Badge[];
  snapshot: {
    // Points/streak ARE reconstructable at a past instant (see file header),
    // so this label is accurate for a past month too.
    pointsAsOfLabel: string;
    totalPoints: number;
    currentStreakDays: number;
    // Skill statuses have no history table — this is always "today"'s live
    // status, even when viewing a past month's report. Labelled separately
    // from pointsAsOfLabel so the UI doesn't imply a historical snapshot
    // that doesn't actually exist.
    skillsAsOfLabel: string;
    skillsMastered: SkillSummary[];
    areasToGiveMoreAttention: SkillSummary[];
    onTrack: SkillSummary[];
  };
};

type SkillSummary = {
  skillId: string;
  subject: string;
  strand: string;
  description: string;
  statusLabel: string;
  reviewCount: number;
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export async function computeMonthlyReport(
  childId: string,
  year: number,
  month: number, // 1-12
  now: Date = new Date()
): Promise<MonthlyReport> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1); // exclusive, first of next month
  const isCurrentMonth = now >= periodStart && now < periodEnd;
  const daysInMonth = Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));
  const daysElapsed = isCurrentMonth
    ? Math.floor((now.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
    : daysInMonth;

  // Snapshot cutoff for "as of" gamification stats: end of the reporting
  // month, or right now if we're still inside it (can't snapshot the future).
  const asOfEnd = periodEnd <= now ? new Date(periodEnd.getTime() - 1) : now;

  const periodReviews = await db
    .select({ review: reviewEvents, subject: skills.subject })
    .from(reviewEvents)
    .innerJoin(skills, eq(reviewEvents.skillId, skills.id))
    .where(and(eq(reviewEvents.childId, childId), gte(reviewEvents.timestamp, periodStart), lt(reviewEvents.timestamp, periodEnd)));

  let itemsCorrect = 0;
  let pointsEarned = 0;
  const bySubject: Record<string, { answered: number; correct: number }> = {};
  const practiceDayKeys = new Set<string>();

  for (const { review, subject } of periodReviews) {
    if (review.correct) itemsCorrect++;
    pointsEarned += pointsForAnswer(review.correct, review.hintUsed);
    bySubject[subject] = bySubject[subject] ?? { answered: 0, correct: 0 };
    bySubject[subject].answered++;
    if (review.correct) bySubject[subject].correct++;
    practiceDayKeys.add(dayKey(review.timestamp));
  }

  const completedSessionsThisMonth = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.childId, childId),
        eq(sessions.status, "completed"),
        gte(sessions.date, periodStart),
        lt(sessions.date, periodEnd)
      )
    );

  // Badges newly earned this month = earned as-of month-end but not yet
  // earned as-of the moment right before the month started.
  const statsAtStart = await computeGamificationStats(childId, new Date(periodStart.getTime() - 1));
  const statsAtEnd = await computeGamificationStats(childId, asOfEnd);
  const badgesAtStart = computeBadges(statsAtStart);
  const badgesAtEnd = computeBadges(statsAtEnd);
  const badgesEarnedThisMonth = badgesAtEnd.filter(
    (b) => b.earned && !badgesAtStart.find((sb) => sb.key === b.key)?.earned
  );

  // Current skill-status snapshot (see file header note on why this can't be
  // limited to "as of the report month" the way points/badges can).
  const states = await db
    .select({ state: childSkillStates, skill: skills })
    .from(childSkillStates)
    .innerJoin(skills, eq(childSkillStates.skillId, skills.id))
    .where(eq(childSkillStates.childId, childId));

  const skillSummaries: (SkillSummary & { status: string })[] = states.map((r) => ({
    skillId: r.skill.id,
    subject: r.skill.subject,
    strand: r.skill.strand,
    description: r.skill.canonicalDescription,
    status: r.state.status,
    statusLabel: statusToParentLabel(r.state.status as any),
    reviewCount: r.state.reviewCount,
  }));

  const totalAnswered = periodReviews.length;

  return {
    period: {
      year,
      month,
      label: `${MONTH_LABELS[month - 1]} ${year}`,
      isCurrentMonth,
      daysElapsed,
      daysInMonth,
    },
    practice: {
      sessionsCompleted: completedSessionsThisMonth.length,
      itemsAnswered: totalAnswered,
      itemsCorrect,
      accuracyPct: totalAnswered > 0 ? Math.round((itemsCorrect / totalAnswered) * 100) : null,
      practiceDays: practiceDayKeys.size,
      pointsEarned,
      bySubject,
    },
    badgesEarnedThisMonth,
    snapshot: {
      pointsAsOfLabel: isCurrentMonth ? "today" : `the end of ${MONTH_LABELS[month - 1]}`,
      totalPoints: statsAtEnd.totalPoints,
      currentStreakDays: statsAtEnd.currentStreakDays,
      skillsAsOfLabel: "today",
      skillsMastered: skillSummaries.filter((s) => s.status === "mastered"),
      areasToGiveMoreAttention: skillSummaries.filter((s) => s.status === "needs_attention"),
      onTrack: skillSummaries.filter((s) => s.status === "on_track"),
    },
  };
}
