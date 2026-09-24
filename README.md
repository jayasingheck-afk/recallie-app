# Recallie — dev scaffold

Early build-out of the Recallie app, per the project's tech-stack and pedagogy docs.

## Repo recovery — September 2026 (read this if things don't run)

A fresh Claude session picked this repo back up after about a month and found it was
actually **broken at HEAD** — `npm run dev` would 500 on any route touching
`/api/session/today` because `src/lib/curriculumWeek.ts` was imported but had never
actually been committed, and `User.enrolledAt` (a column several routes depend on) was
missing from both `schema.ts` and the database migrations. Both were part of earlier
tarball deliveries that evidently didn't fully land — most likely lost somewhere in a round
of manual `tar -xzf` + `git add -A` that didn't catch every new file before committing. The
Week 2 item bank (`week2-item-bank.json`) was similarly never committed, despite being
delivered.

This has now been fixed: `curriculumWeek.ts` recreated, `enrolledAt` added to the schema
with a proper Drizzle migration (`drizzle/0001_...sql`), and the Week 2 item bank restored.
Everything below describes the *intended* current state, now that these are back in place —
run `npm run db:migrate` after pulling this update, in addition to the usual seed commands,
since this update includes a real schema migration for the first time.

Two pieces of repo housekeeping worth doing at the same time, unrelated to the bug above:
`recallie-app` was accidentally committed as an empty git submodule reference (harmless, but
confusing — remove with `git rm --cached recallie-app` and delete the empty folder), and
`tsconfig.tsbuildinfo` (a build artifact that changes on every compile) had been committed —
it's now in `.gitignore`; run `git rm --cached tsconfig.tsbuildinfo` once to stop tracking it.

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
  (points, streak, badges), `GET /api/reports/monthly` (monthly progress report).
- **UI**: `/child` (one-item-at-a-time practice with hints + feedback, real persisted points/
  streak/badges), `/parent/dashboard` (skills mastered / areas to give more attention / recent
  sessions / points, streak & badge shelf, links to reports), `/parent/children` (add a child,
  switch between them), `/parent/reports` (monthly progress report with month navigation and
  a print/Save-as-PDF button).
- **`src/lib/gamification.ts`** — points, daily practice streak, and a 7-badge starter set
  (First Steps, Mission Complete, 3-/7-Day Streak, Number Ninja, Word Wizard, Century Club).
  Fully derived from existing `ReviewEvent`/`Session` rows — no new mutable state, so nothing
  can drift out of sync. See the file's own comments for how to add more badges.
- **`demo/recallie-kid-demo.html`** — a standalone, no-build HTML mockup of the child practice
  flow (real Week 1 sample questions, confetti, mascot) for previewing the UX quickly; not
  wired to the API or database.
- **`src/lib/monthlyReport.ts`** — monthly parent progress report: sessions/points/accuracy/
  practice-days for the selected month, badges newly earned that month (by diffing gamification
  snapshots at month-start vs. month-end — see `computeGamificationStats`'s `asOf` param), plus
  a *current* skills-mastered / areas-to-give-more-attention snapshot (labelled "as of today"
  even on a past month's report, since `ChildSkillState` has no history table to look back on —
  see the file's header comment). Generation + an in-app printable view only; emailing it out
  needs an email service and is still a next step.
- **`src/lib/curriculumWeek.ts`** — derives a child's current curriculum term/week from
  their `enrolledAt` date (10-week terms) instead of hard-coding term 1 / week 1. Currently
  clamped to term 1 / **week 5** (`MAX_AVAILABLE_WEEK`) because that's as far as real item
  bank content reaches so far. Note the curriculum *sequence* (which skills are "new" each
  week) is already fully seeded for all 10 weeks of Term 1, both subjects — see `seed.ts`/
  `year3-curriculum.json` — it's specifically the item bank (actual practice questions)
  that's the limiting factor.
- **Seed data**: full Year 3 Term 1 curriculum (55 skills, both subjects, VIC+NSW mappings,
  all 10 weeks' sequence entries) from the project docs; item banks for **Weeks 1-5**
  (272 items total across 26 skills — 8 original hand-written samples + 264 generated per the
  project's item-generation prompt templates, pending human review). `multi_part` items
  (object-valued answer keys) and items tagged `open_response` are stored but intentionally
  excluded from live sessions by `sessionBuilder.ts`, since the MVP grader
  (`src/lib/grading.ts`) only reliably auto-marks single-value `short_answer` /
  `multiple_choice` items — see `week1-item-bank.json`'s `_note`. The Week 2-5 banks
  (`week2-item-bank.json`, `week3-item-bank.json`, `week4-item-bank.json`,
  `week5-item-bank.json`) are entirely `short_answer`/`multiple_choice` so all of their items
  are usable in live sessions immediately.

## Curriculum content: Week 2

Added a second week of real, auto-gradable practice content so a child can actually progress
past Week 1 instead of practising the same 5 skills forever. The curriculum *sequence* data
(which skills are "new" each week, all 10 weeks of Term 1, both subjects) was already fully
seeded from day one, so this is purely about the missing item bank content plus raising the
clamp that was protecting against empty sessions.

- `src/db/seed/week2-item-bank.json` — 50 items across the 5 skills Week 2 introduces:
  `M3N03_compare_order_10k`, `M3M02_measure_length` (Maths), `E3LY01_02_literal_comprehension`,
  `E3LY06_informative_paragraphs`, `E3LA06_nouns_verbs_agreement` (English). All items are
  `short_answer` or `multiple_choice`, so every item is usable in a live session immediately.
- The literal-comprehension items each have a short reading passage (the `Item` schema and
  session/child-page plumbing already support a `passage` field; `seed-demo.ts` now passes
  it through when seeding).

**Verified**: a fresh child backdated 25 days (which would otherwise compute a later week)
correctly clamps to Week 2 content rather than an empty/broken session; grading works for
both `short_answer` and `multiple_choice` items in the new bank; existing Week-1 children
unaffected.

## Curriculum content: Week 3

Added a third week of real, auto-gradable practice content, following the identical pattern
used for Week 2. Again, no session-builder or schema changes were needed — skills/items are
looked up generically by term+week, and the Week 3 sequence entries already existed from the
original curriculum seed.

- `src/db/seed/week3-item-bank.json` — 50 items across the 5 skills Week 3 introduces:
  `M3N04_add_sub_1000_no_regroup`, `M3M02_measure_mass` (Maths),
  `E3LY01_02_inferential_comprehension`, `E3LY06_3LE02_narrative_problem_solution`,
  `E3LA02_03_adjectives_adverbs_commas` (English). All items are `short_answer` or
  `multiple_choice`, so every item is usable in a live session immediately.
- The inferential-comprehension items include three short reading passages, each used across
  a small cluster of items (same `passage` field mechanism as Week 2's literal-comprehension
  items).
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_WEEK` is now 3.
- `src/db/seed/seed-demo.ts` now also loads `week3-item-bank.json`.

**Verified**: a fresh child backdated 15 days correctly receives Week 3 content for both
Maths and English (including passages); a child backdated 90 days correctly clamps to Week 3
rather than an empty/broken session; grading works for both `short_answer` and
`multiple_choice` items in the new bank (including case-insensitive matching on the
inferential-comprehension items); a full page/API regression pass and a production
`next build` both completed cleanly with no errors.

## Curriculum content: Week 4

Added a fourth week of real, auto-gradable practice content. This finishes out the
remaining, already-defined skills for **Weeks 4-10 of Term 1** one week at a time — the
curriculum sequence for all of Term 1's 10 weeks (which skills are "new" each week) has
existed since the original seed, so each remaining week is purely "write the item bank +
raise `MAX_AVAILABLE_WEEK`", no new curriculum design needed until Term 1 is finished and
Term 2 begins.

- `src/db/seed/week4-item-bank.json` — 60 items across the 6 skills Week 4 introduces:
  `M3N04_add_sub_1000_regroup`, `M3M02_measure_capacity`, `M3ST01_categorical_data` (Maths);
  `E3LA04_LY03_text_structure`, `E3LY06_LA04_information_report`, `E3LA08_tense_consistency`
  (English). All items are `short_answer` or `multiple_choice`.
- The text-structure items use a short instructional passage ("How to Make a Paper Boat")
  to test recognising introduction/body/conclusion structure and signposting.
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_WEEK` is now 4.
- `src/db/seed/seed-demo.ts` now also loads `week4-item-bank.json`.

**Verified**: a child backdated 22 days correctly receives Week 4 content for both Maths and
English; a child backdated 100 days correctly clamps to Week 4 rather than an empty/broken
session; grading verified correct/incorrect/case-insensitive across all three question
styles used (straight computation, unit/vocabulary multiple-choice, and passage-based);
a full page/API regression pass and a production `next build` both completed cleanly.

## Curriculum content: Week 5

Added a fifth week of real, auto-gradable practice content, continuing the same
established pattern — the Week 5 sequence entries already existed from the original
curriculum seed, so this was purely item-bank content plus raising the clamp.

- `src/db/seed/week5-item-bank.json` — 50 items across the 5 skills Week 5 introduces:
  `M3N06_multiplication_equal_groups`, `M3M04_time_to_minute` (Maths);
  `E3LY03_LA03_persuasive_opinion`, `E3LY06_LA03_write_persuasive`,
  `E3LA03_11_modal_verbs_apostrophes` (English). All items are `short_answer` or
  `multiple_choice`.
- The persuasive-opinion items share a short persuasive text ("Save Our School Pool!") used
  across a small cluster of comprehension items, the same `passage` mechanism used in
  earlier weeks.
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_WEEK` is now 5.
- `src/db/seed/seed-demo.ts` now also loads `week5-item-bank.json`.

**Verified**: a child backdated 29 days correctly receives Week 5 content for both Maths and
English (including the shared passage); a child backdated 110 days correctly clamps to Week 5
rather than an empty/broken session; grading verified correct/incorrect/case-insensitive
across a straight-computation item, a time-telling item, a passage-based persuasive-
comprehension item, and a case-insensitive multiple-choice modal-verb item; a full page/API
regression pass and a production `next build` both completed cleanly.

## Year 3 full-syllabus plan (in progress)

Chandana asked for the full Year 3 Maths + English syllabus (not just Term 1), plus a new
parent-facing "assign a focus topic" feature alongside the automatic daily session. Before
generating content at that scale, a curriculum-accuracy check against the real Australian
Curriculum v9.0 Year 3 content descriptors (ACARA/QCAA) found that Term 1's 10-week sequence
already touches nearly the entire year's content descriptor set (21/23 Maths, 26/28 English)
— so "the rest of the year" is mostly about *depth progression* per term, not new topics,
plus 4 small content-descriptor gaps and finishing Term 1's remaining item banks (Weeks
4-10) first. The full plan — term-by-term depth progression tables for every strand, the 4
gaps to fill, and the topic-assignment feature's proposed shape — is written up in this
project's `claude/year3-full-syllabus-plan.md` doc. Current status: Weeks 1-5 of Term 1 are
now complete; Weeks 6-10 and the Terms 2-4 curriculum mapping are still to come.

## Auth (Clerk) — optional, opt-in

Parent sign-in uses [Clerk](https://clerk.com), but it's entirely opt-in: with no Clerk keys
set, the app runs exactly as it always has, in demo mode — every parent page acts as a single
seeded demo parent (`demo_parent_1`), no sign-in required. Setting two environment variables
turns on real sign-in with zero code changes needed.

**How it's wired:**

- **`src/lib/currentParent.ts`** — the single place that resolves "who's the acting parent
  right now". `isAuthConfigured()` checks whether `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set.
  `getCurrentParentId()` returns the demo parent's id when it isn't, or looks up (creating on
  first sign-in) the real `User` row for the signed-in Clerk user when it is.
- **`src/middleware.ts`** — only builds and applies `clerkMiddleware()` (protecting
  `/parent/*`) when Clerk is configured; otherwise it's a pure passthrough.
- **`src/app/layout.tsx`** — only wraps the app in `<ClerkProvider>` and shows a sign-in
  button / user menu when Clerk is configured.
- **`src/app/sign-in/[[...sign-in]]/page.tsx`**, **`src/app/sign-up/[[...sign-up]]/page.tsx`**
  — Clerk's catch-all route convention; each shows a plain "not set up yet" message in demo
  mode instead of erroring.
- Everything Clerk-related is loaded via dynamic `import("@clerk/nextjs")` behind the
  `isAuthConfigured()`/`clerkConfigured` check, so the package is never touched at all unless
  the keys are present.

**Security fix bundled with this change:** `GET`/`POST /api/children` previously trusted a
client-supplied `parentId` — anyone could list or add children under *any* parent id just by
knowing or guessing it. Both routes now derive the acting parent server-side via
`getCurrentParentId()` instead. `/parent/children` and its `fetch` calls were updated to match
(no `parentId` sent or needed).

**To turn on real sign-in:**

1. Create a free account at [clerk.com](https://clerk.com) and a new Application.
2. Pick the sign-in methods you want (email code, Google, etc.) in the Clerk dashboard.
3. Copy the Publishable key and Secret key from the dashboard's API Keys page.
4. Add them to `.env`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
   CLERK_SECRET_KEY="sk_test_..."
   ```
5. Restart `npm run dev`. `/parent/*` routes now require sign-in; a "Sign in" button appears
   in the header.

**Not yet verified:** the sandbox this was built in has no real Clerk account, so the actual
live sign-in/sign-up flow (steps above) has not been tested end-to-end — only the demo-mode
(no keys set) path has been verified, deliberately, to confirm this change is a safe no-op
until you add your own keys. Please test the real flow once you've added yours and let me know
if anything doesn't work as expected.

**Authorization on child-scoped routes (closed):** `/api/dashboard`, `/api/session/today`,
`/api/reviews`, `/api/gamification`, and `/api/reports/monthly` previously trusted a `childId`
query/body param with no check that the acting parent actually owned that child — a signed-in
parent could view or answer on behalf of any child by guessing/passing a different id.
`verifyChildAccess()` (`src/lib/currentParent.ts`) now checks the acting parent has a
`ParentChildLink` to the requested child before any of these routes do anything — 401 if not
signed in, 403 if signed in but not linked to that child. Verified: the demo parent's own
children still get 200 on every route (including a fresh child added via `/api/children`
mid-testing); an unowned/nonexistent `childId` gets 403 on every route, including
`POST /api/reviews` with a real item id.

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

- Real item banks — Weeks 1-5 only (272 items) so far, and all of it still needs human
  review per the project's QA process before it's "production" content. Weeks 6-10 (Term 1)
  still need generating (sequence already exists, so each is "write the item bank + bump
  `MAX_AVAILABLE_WEEK`" — no sequence/schema work needed); Terms 2-4 need genuine new
  curriculum-design work first (see `claude/year3-full-syllabus-plan.md` in the project).
- Grading support for `multi_part` (object-valued answers) and `open_response` (rubric/
  teacher-review) item types — currently excluded from live sessions entirely.
- Stripe subscriptions, free trial gating.
- Gamification: a visual "progress map" (spatial/adventure-style, beyond the badge shelf) is
  still open; badges are only evaluated on demand (no push notification when one's earned
  outside an active session).
- Monthly report *emailing* — generation + an in-app printable view exist (`/parent/reports`);
  actually sending it (scheduled, via email) needs an email service (e.g. Resend, SES) not yet
  wired up.
