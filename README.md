# Recallie — dev scaffold

Early build-out of the Recallie app, per the project's tech-stack and pedagogy docs.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **PostgreSQL** + **Drizzle ORM** (see note below on why Drizzle instead of Prisma)
- No real login yet — every parent-facing page runs as one seeded demo parent account, but
  that parent can now add/manage multiple children (see "Parent onboarding" below)

## Why Drizzle instead of Prisma

The project docs specify Prisma. In the sandbox this was built in, Prisma's CLI couldn't
download its query/schema-engine binaries (network-restricted to package registries only,
not `binaries.prisma.sh`). Drizzle is pure TypeScript/JS with no binary download step, and
the project docs themselves list it as an acceptable alternative ORM. The schema (`src/db/schema.ts`)
is a 1:1 translation of the documented Prisma models — same tables, columns, and relations —
so switching back to Prisma later (in an environment that can reach its binaries) is a
mechanical schema-file translation, not a redesign.

## Getting started

```bash
npm install

# 1. Point DATABASE_URL at a Postgres instance (see .env.example)
cp .env.example .env

# 2. Create tables
npm run db:migrate

# 3. Seed Year 3 Term 1 Maths & English curriculum (skills + weekly sequence)
npm run db:seed

# 4. Seed a demo parent/child + a small sample item bank (Week 1 skills only)
npm run db:seed:demo

# 5. Run the app
npm run dev
```

Visit `/parent/children` to add a child (name, year level, state) and jump into their
practice session or dashboard. `/child` and `/parent/dashboard` both accept a `?childId=`
query param (e.g. `/child?childId=abc123`, linked to automatically from `/parent/children`);
without one they fall back to the seeded demo child (`demo_child_1` — "Alex", Year 3, NSW).
There's still no login — every add-child call runs as one hard-coded demo parent
(`demo_parent_1`) until Clerk auth is wired up.

## What's implemented

- **`src/db/schema.ts`** — full data model: User, ParentChildLink, Skill,
  CurriculumSequenceEntry, ChildSkillState, ReviewEvent, Item, Session, Subscription.
- **`src/lib/spacedRepetition.ts`** — the FSRS-inspired scheduler from the project docs
  (stability/difficulty/lapses → next review interval + status).
- **`src/lib/sessionBuilder.ts`** — daily session assembly: ~40% review / ~35% new /
  ~25% mixed, interleaved so no more than 2 consecutive items share a skill.
- **`src/lib/grading.ts`** — simple string-match grading for `short_answer` /
  `multiple_choice` items (MVP only — see comments for what's missing).
- **API routes**: `GET /api/session/today`, `POST /api/reviews`, `GET /api/dashboard`,
  `GET`/`POST /api/children` (parent onboarding — list/add children), `GET /api/gamification`
  (points, streak, badges).
- **UI**: `/child` (one-item-at-a-time practice with hints + feedback, real persisted points/
  streak/badges), `/parent/dashboard` (skills mastered / areas to give more attention / recent
  sessions / points, streak & badge shelf), `/parent/children` (add a child, switch between them).
- **`src/lib/gamification.ts`** — points, daily practice streak, and a 7-badge starter set
  (First Steps, Mission Complete, 3-/7-Day Streak, Number Ninja, Word Wizard, Century Club).
  Fully derived from existing `ReviewEvent`/`Session` rows — no new mutable state, so nothing
  can drift out of sync. See the file's own comments for how to add more badges.
- **`demo/recallie-kid-demo.html`** — a standalone, no-build HTML mockup of the child practice
  flow (real Week 1 sample questions, confetti, mascot) for previewing the UX quickly; not
  wired to the API or database.
- **`src/lib/curriculumWeek.ts`** — derives a child's current curriculum term/week from
  their `enrolledAt` date (10-week terms) instead of hard-coding term 1 / week 1. Currently
  clamped to term 1 / week 1 because that's the only week with real curriculum-sequence +
  item bank content — see "Explicit next steps".
- **Seed data**: full Year 3 Term 1 curriculum (55 skills, both subjects, VIC+NSW mappings)
  from the project docs; a Week 1 item bank (62 items across the 5 Week 1 skills — 8 original
  hand-written samples + 54 generated per the project's item-generation prompt templates,
  pending human review). `multi_part` items (object-valued answer keys) and items tagged
  `open_response` are stored but intentionally excluded from live sessions by
  `sessionBuilder.ts`, since the MVP grader (`src/lib/grading.ts`) only reliably auto-marks
  single-value `short_answer` / `multiple_choice` items — see `week1-item-bank.json`'s `_note`.

## Bugs found and fixed while building gamification

Two pre-existing correctness issues surfaced while testing the new points/streak/badges
feature end-to-end, both fixed in the same change:

- `GET /api/session/today`'s "already built today" path only ever returned
  `plannedItemIds`/`completedItemIds`, never the actual question content. Any reload after
  the first load of the day (or a second visit later that day) showed "no items available"
  even though the session had unfinished items. Fixed by hydrating full item details for the
  remaining (not-yet-completed) items on that path too.
- `POST /api/reviews` looked up "today's session" by child + date only, with no subject
  filter — on a day with both a Maths and an English session, an answer to one could get
  marked complete on the *other* subject's session. Fixed by matching on which session
  actually planned that item, not just which one was created first.

Both were caught by testing the real multi-subject, multi-load flow (not just a single
happy-path run) and verified fixed with a scripted repro before moving on.

## Known nuance to review

The "needs_attention" status (shown to parents as "Area to give more attention") triggers
whenever `stability <= 7 days` — which, per the documented thresholds, is true for *every*
skill during its first ~1–2 weeks of practice, even after several correct answers in a row
(confirmed by a manual trace: 6 straight correct/fast answers only got stability to ~5.6).
So brand-new skills look like they "need attention" by default until they mature past a
week of stability. This is a faithful implementation of the thresholds in the project's
spaced-repetition design doc, not a bug introduced here — but it may not match the intended
parent-facing experience (new skills being flagged as needing attention could read as
discouraging). Worth deciding: raise the mastery/attention thresholds, add a distinct
"still building" status for skills younger than N days, or accept it as-is.

## Explicit next steps (not yet built)

- Auth (Clerk) — every page currently hard-codes the demo child ID.
- Real item banks — Week 1 only (62 items) so far, and the 54 generated items still need
  human review per the project's QA process before they're "production" content. Weeks
  2-10 (Term 1) and other year levels/terms still need generating.
- Grading support for `multi_part` (object-valued answers) and `open_response` (rubric/
  teacher-review) item types — currently excluded from live sessions entirely.
- Stripe subscriptions, free trial gating.
- Curriculum weeks 2-10 (Term 1) and beyond — `curriculumWeek.ts` is wired up and ready to
  roll a child forward automatically once more weeks of sequence + item content exist; it's
  clamped to week 1 only until then (see that file's comments for the constants to raise).
- Gamification: a visual "progress map" (spatial/adventure-style, beyond the badge shelf) is
  still open; badges are only evaluated on demand (no push notification when one's earned
  outside an active session).
- Monthly parent report generation/email.
