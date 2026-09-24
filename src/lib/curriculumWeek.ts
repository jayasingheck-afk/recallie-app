/**
 * Derives a child's current curriculum term/week from their enrolment date,
 * per the project's 10-week-term structure, instead of hard-coding
 * term 1 / week 1 for everyone.
 *
 * Note: src/db/seed/year3-curriculum.json and seed.ts already define and
 * insert curriculumSequenceEntries rows for ALL 10 weeks of Year 3 Term 1
 * (both subjects) — the "new skill" sequence isn't the bottleneck. What's
 * actually limited is the item bank: only Weeks 1-5 have real practice
 * questions written for their newly-introduced skills so far (see
 * src/db/seed/week1-item-bank.json, week2-item-bank.json,
 * week3-item-bank.json, week4-item-bank.json, week5-item-bank.json).
 * Advancing MAX_AVAILABLE_WEEK further without matching item content would
 * leave a child with "new" skills that have no items to practise — raise it
 * only once each additional week's item bank exists.
 */

const WEEKS_PER_TERM = 10;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Raise MAX_AVAILABLE_WEEK as each additional week's item bank is written
// (see the note above — curriculum sequence data already covers all 10
// weeks; item content is what's actually rate-limiting here). Raise
// MAX_AVAILABLE_TERM once Term 2+ curriculum + items exist.
const MAX_AVAILABLE_TERM = 1;
const MAX_AVAILABLE_WEEK = 5;

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
