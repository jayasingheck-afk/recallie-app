/**
 * Derives a child's current curriculum term/week from their enrolment date,
 * per the project's 10-week-term structure, instead of hard-coding
 * term 1 / week 1 for everyone.
 *
 * As of this update, item banks now exist for ALL 10 weeks of Year 3 Term 1
 * (both subjects) — see src/db/seed/week1-item-bank.json through
 * week10-item-bank.json. Term 1 is complete: 55 skills, 562 items. The
 * curriculum *sequence* data (src/db/seed/year3-curriculum.json / seed.ts)
 * has covered all 10 weeks since the original seed; item content was always
 * the limiting factor, and it's now caught up for the whole term.
 * Terms 2-4 still need genuine new curriculum-design work (see this
 * project's claude/year3-full-syllabus-plan.md doc) before
 * MAX_AVAILABLE_TERM can be raised past 1.
 */

const WEEKS_PER_TERM = 10;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// MAX_AVAILABLE_WEEK is now 10 — all of Term 1's item banks exist. Raise
// MAX_AVAILABLE_TERM once Term 2+ curriculum + items exist.
const MAX_AVAILABLE_TERM = 1;
const MAX_AVAILABLE_WEEK = 10;

export type TermWeek = { term: number; week: number };

export function computeCurrentTermWeek(enrolledAt: Date | null | undefined, now: Date = new Date()): TermWeek {
  if (!enrolledAt) return { term: 1, week: 1 };

  const msSince = now.getTime() - enrolledAt.getTime();
  const weeksSince = Math.max(0, Math.floor(msSince / MS_PER_WEEK));

  const term = Math.floor(weeksSince / WEEKS_PER_TERM) + 1;
  const week = (weeksSince % WEEKS_PER_TERM) + 1;

  if (term > MAX_AVAILABLE_TERM) {
    return { term: MAX_AVAILABLE_TERM, week: MAX_AVAILABLE_WEEK };
  }
  return { term, week: Math.min(week, MAX_AVAILABLE_WEEK) };
}
