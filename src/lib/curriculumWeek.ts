/**
 * Derives a child's current curriculum term/week from their enrolment date,
 * per the project's 10-week-term structure, instead of hard-coding
 * term 1 / week 1 for everyone.
 *
 * As of this update, item banks now exist for ALL of Year 3 (Terms 1-4,
 * Weeks 1-10, both subjects) — see src/db/seed/week1-item-bank.json through
 * week10-item-bank.json (Term 1) and term2/3/4-maths/english-item-bank.json
 * (Terms 2-4). The full Year 3 curriculum is complete: 151 skills, 1,522
 * items across both subjects. Curriculum sequence data
 * (src/db/seed/year3-curriculum.json / seed.ts) covers all 4 terms x 10
 * weeks for both subjects. Four AC v9.0 content-descriptor gaps identified
 * during Term 1 (time relationships AC9M3M03, money dollars/cents
 * AC9M3M06, reading fluency AC9E3LY04, listening/viewing comprehension
 * AC9E3LY05) are now filled and deepened across Terms 2-4.
 */

const WEEKS_PER_TERM = 10;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// All of Year 3 (Terms 1-4, Weeks 1-10) now has real curriculum + item
// content. A child who has been enrolled long enough simply stays clamped
// at the end of Year 3 (term 4, week 10) until Year 4 content is designed.
// Exported so other places that need "how long is the whole curriculum"
// (e.g. src/app/api/progress-map/route.ts) don't re-hardcode 4/10.
export const MAX_AVAILABLE_TERM = 4;
export const MAX_AVAILABLE_WEEK = 10;

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
