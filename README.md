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

# 3. Seed the full Year 3 Maths & English curriculum (skills + weekly sequence,
#    Terms 1-4, Weeks 1-10)
npm run db:seed

# 4. Seed a demo parent/child + the full item bank (all 4 terms, both subjects)
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
- **`src/lib/grading.ts`** — string-match grading for `short_answer` / `multiple_choice`
  items, part-by-part grading for `multi_part` items, plus self-assessment for
  `open_response`-tagged items (see "Grading support for multi_part and open_response items"
  below). `drag_drop`/`matching` have no content or grader yet.
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
  their `enrolledAt` date (10-week terms) instead of hard-coding term 1 / week 1. Now
  clamped to **term 4 / week 10** (`MAX_AVAILABLE_TERM`/`MAX_AVAILABLE_WEEK`) — **the full
  Year 3 curriculum is complete**; a child enrolled long enough progresses through all four
  terms and stays clamped at the end of Year 3 rather than looping or erroring.
- **Seed data**: the full Year 3 curriculum (151 skills across both subjects, VIC+NSW
  mappings, all 4 terms x 10 weeks of sequence entries) from the project docs; item banks for
  **all of Terms 1-4, Weeks 1-10** (1,522 items total across 151 skills — 8 original
  hand-written samples + 1,514 generated per the project's item-generation prompt templates,
  pending human review). The 4 `multi_part` items and 2 `open_response`-tagged items in the
  bank (all in `week1-item-bank.json`) are fully usable in live sessions — see "Grading
  support for multi_part and open_response items" below. Every other bank (Weeks 2-10 and
  all of Terms 2-4) is entirely `short_answer`/`multiple_choice`.

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

## Curriculum content: Week 6

Added a sixth week of real, auto-gradable practice content, continuing the established
pattern — the Week 6 sequence entries already existed from the original curriculum seed.

- `src/db/seed/week6-item-bank.json` — 60 items across the 6 skills Week 6 introduces:
  `M3N06_division_sharing_grouping`, `M3M05_angles_as_turns`, `M3ST02_column_graphs`
  (Maths); `E3LA10_LY01_technical_vocabulary`, `E3LY06_LA05_explanation_texts`,
  `E3LY10_09_affixes_multisyllabic` (English). All items are `short_answer` or
  `multiple_choice`.
- The column-graph items describe two small categorical datasets as text (a "Favourite
  Fruit" and a "Pets Owned" graph) via the `passage` field, since there's no image
  rendering yet — the same mechanism used for reading passages in earlier weeks.
- The technical-vocabulary items use a short informative passage ("The Water Cycle") with
  an inline glossary, testing both context-clue and glossary-lookup strategies.
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_WEEK` is now 6.
- `src/db/seed/seed-demo.ts` now also loads `week6-item-bank.json`.

**Verified**: a child backdated 38 days correctly receives Week 6 content for both Maths and
English (including the shared graph/passage items); a child backdated 130 days correctly
clamps to Week 6 rather than an empty/broken session; grading verified correct/incorrect/
case-insensitive across a division word problem, an angle-as-turns item, a passage-based
technical-vocabulary item, and a case-insensitive multiple-choice column-graph item; a full
page/API regression pass and a production `next build` both completed cleanly.

## Curriculum content: Weeks 7-10 (Term 1 complete)

Added the remaining four weeks of Term 1 in one batch, at Chandana's request to cover the
whole term at once rather than one week at a time. Same established pattern throughout —
the sequence entries for all of Weeks 7-10 already existed from the original curriculum
seed, so this was purely item-bank content across 23 skills (230 items).

- `src/db/seed/week7-item-bank.json` — 50 items across 5 skills: `M3N06_mult_2digit_by_1digit`,
  `M3SP01_classify_2d_shapes` (Maths); `E3LY01_LA09_evaluative_comprehension` (shared "The
  Lighthouse Keeper" passage), `E3LY06_3LE04_text_response`, `E3LA05_07_cohesive_devices`
  (English).
- `src/db/seed/week8-item-bank.json` — 60 items across 6 skills: `M3N07_unit_fractions`,
  `M3SP02_2d_maps_plans` (shared text-described school map), `M3P01_chance_language` (Maths);
  `E3LE01_02_03_literature_characters_themes` (shared "The Brave Little Seed" passage),
  `E3LY06_3LE02_05_write_imaginative`, `E3LA03_LE03_figurative_language` (English).
- `src/db/seed/week9-item-bank.json` — 60 items across 6 skills: `M3N04_06_word_problems`,
  `M3M02_measurement_problems`, `M3P02_chance_experiments` (Maths); `E3LY09_01_fluency_decoding`,
  `E3LY06_07_editing_writing`, `E3LY11_10_spelling_patterns` (English).
- `src/db/seed/week10-item-bank.json` — 60 items across 6 skills: `M3N05_06_financial_contexts`,
  `M3M01_04_measurement_consolidation`, `M3ST02_03_data_interpretation` (shared text-described
  rainfall table, Maths); `E3LA09_LY03_multimodal_reading` (shared text-described fete
  poster), `E3LY06_08_multimodal_writing`, `E3LA06_LY09_12_language_consolidation` (English,
  a broad grammar/punctuation/spelling revision skill).
- Since there's no image rendering yet, visual concepts (2D maps, data tables) are described
  as text via the existing `passage` field — the same mechanism used for reading passages —
  rather than skipped.
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_WEEK` is now 10 (all of Term 1).
- `src/db/seed/seed-demo.ts` now loads all ten week banks.

**Verified**: children backdated to land in each of Weeks 7, 8, 9, and 10 correctly receive
that week's content for both Maths and English; a child backdated 200 days (well past Term 1)
correctly clamps to Week 10 rather than an empty/broken session; grading verified
correct/incorrect/case-insensitive/array-accepted-phrasing across six different question
styles spanning the new banks (2-digit multiplication, unit fractions, passage-based
evaluative comprehension, case-insensitive multiple-choice word problems, a decimal money
answer, and passage-based multimodal reading); a full page/API regression pass and a
production `next build` both completed cleanly with zero ID collisions across all 562 items.

## Curriculum content: Terms 2-4 (full Year 3 complete)

Chandana asked to cover the rest of the year ("full term 2-4 at once") in one batch, rather
than term by term. Given the scale (~960 items across 96 new skills), item-bank authorship
was delegated to 6 parallel subagents — one per Term x Subject combination — each fully
scoped with the exact item schema, the multiple-choice-answer-embedded-in-questionText rule
(this project's fix for the earlier "extra positional argument" corruption bug), and a
guaranteed-unique ID prefix (`T2M`/`T2E`/`T3M`/`T3E`/`T4M`/`T4E`). A further 6 subagents then
authored the matching curriculum skill-definition objects (AC v9.0 codes, VIC Curriculum 2.0
phrasing, NSW Stage 2 syllabus outcomes), grounded against the actual item content. All 12
outputs were independently re-validated (not just trusted) before integration: item schema,
tag/hint/misconception counts, ID uniqueness within and across all files and against the
existing 562 Term 1 item IDs, and — critically — every multiple-choice `answerKey` checked
against its embedded options via the same regex cross-check used for every prior week. Two of
the six item-bank agents had left a stray `"B) "`-style letter prefix on 68 `answerKey`
values (`term3-maths` and `term4-maths`); this was caught by the re-validation pass (not
self-reported) and fixed by stripping the prefix so answers again match the exact-option-text
convention `src/lib/grading.ts` relies on.

- `src/db/seed/term2-maths-item-bank.json`, `term2-english-item-bank.json`,
  `term3-maths-item-bank.json`, `term3-english-item-bank.json`, `term4-maths-item-bank.json`,
  `term4-english-item-bank.json` — 160 items each (960 total), 16 skills each (96 total),
  10 items per skill.
- `src/db/seed/year3-curriculum.json` — extended with all 96 new skill-definition objects
  (`subjects.maths.skills` / `subjects.english.skills`) and new `sequence["2"]`,
  `sequence["3"]`, `sequence["4"]` entries (weeks 1-6 introduce 2 new skills each, weeks 7-10
  introduce 1 each — 16 skills/term/subject over 10 weeks).
- The 4 AC v9.0 content-descriptor gaps identified during Term 1 are now filled and deepened
  across the year: `AC9M3M03` (time relationships → Term 2's `M3M03_time_relationships` →
  Term 3's duration word problems → Term 4's timetables/calendars), `AC9M3M06` (money
  dollars/cents → Term 2's `M3M06_money_dollars_cents` → Term 4's change/budgets),
  `AC9E3LY04` (reading fluency → Term 2 → Term 3's self-correction strategies → Term 4's
  fluent reading range), `AC9E3LY05` (listening/viewing comprehension → Term 2 → Term 3's
  viewing comprehension → Term 4's oral presentation).
- New Term 2/3 skills were designed only after cross-referencing all 55 existing Term 1
  skill IDs/AC codes, to avoid duplicating content the original syllabus-plan doc had
  proposed for "Term 2" that turned out to already be covered by Term 1 Weeks 7-10.
- `src/lib/curriculumWeek.ts`'s `MAX_AVAILABLE_TERM` is now 4 (`MAX_AVAILABLE_WEEK` stays 10,
  since every term has 10 weeks) — a child who has been enrolled long enough now progresses
  through the whole Year 3 curriculum and clamps at Term 4 Week 10 rather than Term 1.
- `src/db/seed/seed-demo.ts` now loads all 16 item-bank files (10 Term 1 + 6 Terms 2-4).

**Verified**: `npx tsc --noEmit` clean; `db:migrate`/`db:seed`/`db:seed:demo` all ran clean in
the sandbox (73 maths skills, 78 english skills, 80 sequence entries across 4 terms x 10
weeks x 2 subjects, 1,522 items total, zero ID collisions); backdated test children landing
in Term 2 Week 1, Term 3 Week 1, Term 4 Week 1, and Term 4 Week 10 each correctly received
that term/week's new-skill content for both subjects; a child backdated 200 weeks correctly
clamped to Term 4 Week 10 instead of erroring or returning an empty session; grading verified
across the 4 gap-filling skills plus a random sample of 30 multiple-choice items (answerKey
matches an embedded option) plus all multi-value/array-answerKey items in the whole bank
(342 items) — 163 checks, 0 failures; a full page/API regression pass (`/`, `/api/children`,
`/api/dashboard`, `/api/session/today` for both subjects, `/api/reviews` correct + incorrect
submissions against new Term 2 items, `/api/gamification`, `/api/reports/monthly`) and a
production `next build` both completed cleanly.

## Content review workflow

All 1,522 generated items are AI-written and need a human review pass before they're treated
as production content — this is a spreadsheet-based process rather than a new admin UI, so it
doesn't need a dev server running to work through.

- `src/db/seed/export-items-for-review.ts` — exports every item to a formatted `.xlsx`
  workbook: an "Items" tab (one row per item, sorted by subject/term/week/skill, with a
  `reviewStatus` dropdown and free-text `reviewNotes` column, autofilter and a frozen header),
  a "Summary" tab (live `COUNTIFS` tally of pending/approved/flagged per subject), and an
  "Instructions" tab explaining what to fill in and what happens next. Re-running it later
  picks up whatever review decisions are already saved in the database, so nothing already
  reviewed has to be redone.
  ```
  npm run review:export -- recallie-content-review.xlsx
  ```
- `src/db/seed/import-review.ts` — reads a completed workbook back and updates each item's
  `reviewStatus`/`reviewNotes` in the database, matching by `itemId`. Only those two columns
  are trusted from the sheet; editing any other column (question text, answer key, etc.) in
  the spreadsheet has no effect on the real data. Warns about unrecognised statuses (defaults
  them to `pending`) and about any item ids present in the sheet but not in the database.
  ```
  npm run review:import -- recallie-content-review.xlsx
  ```
- **Default behaviour, deliberately chosen to keep the app usable during review**: every item
  starts `pending`, and `pending`/`approved` items both keep appearing in live sessions
  exactly as they do today — only items a reviewer explicitly marks `flagged` are excluded
  (`src/lib/sessionBuilder.ts`'s item-pool query). Marking something `approved` is purely a
  record of having checked it; it doesn't change what children see. A stricter
  "hide-until-approved" default was considered and deliberately rejected, since it would empty
  every session app-wide on day one (nothing has been reviewed yet).
  `src/db/schema.ts`'s `items` table gained three columns for this: `reviewStatus` (text,
  default `"pending"`), `reviewNotes` (text, nullable), `reviewedAt` (timestamp, nullable) —
  see migration `drizzle/0002_perfect_slyde.sql`.

**Verified**: exported the full 1,522-item workbook, ran it through a formula-recalculation
check (0 errors across 9 formulas), spot-checked the Summary tab's counts against a direct
database query (736 maths + 786 english = 1,522, matching exactly), round-tripped a test
import (marked one item `approved` with a note, one `flagged` with a note, and one with a
deliberately invalid status to confirm it's safely defaulted to `pending` with a warning
rather than silently corrupting data), confirmed the flagged item's skill pool dropped from 14
items to 13 and that `buildTodaySession` never returned it across 15 repeated builds, then
reset all 1,522 items back to a clean `pending` state before delivery so Chandana's real
export starts fresh. A production `next build` and the usual API regression pass both stayed
clean after the schema change.

## Focus topic feature

A parent-assigned "focus topic": the parent picks one specific skill for their child, and it
gets blended into that child's next daily session for the matching subject — no separate
practice mode, no extra screen for the child to find. Two design questions were resolved with
Chandana before building: **who picks the topic** (the parent, not the child — a "quick assign"
button sits right on the "areas to give more attention" cards, plus a full browse-by-strand
picker) and **how it's delivered** (blended into today's session rather than a standalone
activity, so it doesn't add another thing for the child to do).

- `src/db/schema.ts` — `users` gained `assignedFocusSkillId` (nullable, FK to `skills.id`,
  `onDelete: "set null"`) and `assignedFocusSetAt` (nullable timestamp). One active assignment
  per child, no history table, persists until the parent changes or clears it — no
  auto-expiry. See migration `drizzle/0003_quick_viper.sql`.
- `GET /api/topics?subject=maths|english&yearLevel=3` — returns the strand → skill tree so a
  parent can browse and pick a skill (`src/app/api/topics/route.ts`).
- `GET/POST /api/focus-topic` — reads or sets a child's current assignment
  (`src/app/api/focus-topic/route.ts`); `POST` with `skillId: null` clears it. Both verify
  parent ownership of the child via the existing `verifyChildAccess` helper.
- `src/lib/sessionBuilder.ts` — if the child has an assignment whose subject matches the
  session being built, a small "focus" slice (`Math.min(4, Math.max(2, round(targetN * 0.15)))`
  items, so 2-4 out of Year 3's 20-item target) is carved **out of** the existing `mixed`
  slice rather than added on top, so total session length never changes. If the assignment's
  subject doesn't match the subject being built (e.g. a maths focus topic on an English
  session), it has no effect at all. The new "focus" items flow through the same
  `interleave()` bucketing as review/new/mixed, so they're still spread through the session
  rather than clumped together.
- `src/app/api/dashboard/route.ts` and `src/app/parent/dashboard/page.tsx` — the dashboard now
  surfaces the current assignment (or lack of one), a subject/skill picker to set or change it,
  a "Clear" button, and a one-click "Assign as focus topic" button directly on each "area to
  give more attention" card.

**Verified**: `GET /api/topics?subject=maths` returns a correctly grouped strand → skill tree;
assigning a skill via `POST /api/focus-topic` and rebuilding the day's maths session produced
`breakdown: {review: 0, new: 8, mixed: 0, focus: 3, target: 20}` with exactly 3 items from the
assigned skill and the target unchanged at 20; the same child's English session for the same
day showed `focus: 0` (a maths-only assignment doesn't touch English); clearing the assignment
and rebuilding reverted the maths session to `focus: 0`. A production `next build`, `tsc
--noEmit`, and a regression pass across `/api/children`, `/api/gamification`,
`/api/reports/monthly`, and `/api/reviews` all stayed clean after the schema change.

## Grading support for multi_part and open_response items

`multi_part` and `open_response`-tagged items were previously excluded from every child's
session entirely, because the MVP grader could only exact-match a single-value answer. Both
are now live:

- **`multi_part` items** (an object of several short exact sub-answers, e.g.
  `{ largest: "8520", smallest: "2058" }`) are graded part-by-part
  (`src/lib/grading.ts`'s `checkMultiPartAnswer`) with the same forgiving whitespace/case
  match as everything else; the item counts correct only if every part does.
  `/api/reviews`'s response includes `partsCorrect` so the child sees which specific parts
  they got right, not just one pass/fail for the whole question. The child UI renders one
  labelled input per sub-answer key (`answerFields` on the session item — the ordered keys
  only, never the values, so nothing about the answer leaks before grading).
- **`open_response`-tagged items** (free-text answers with no single correct wording, e.g.
  "what's the purpose of this text?") can't be fairly exact-matched for a Year 3 writer, so
  they're **self-assessed** instead: the child writes their own attempt, reveals the model
  answer/step-by-step solution (included directly in the session payload for these items
  only — see `sessionBuilder.ts`'s `SessionItem.stepByStepSolution` — since there's no other
  way to self-assess without seeing it), and honestly marks "I got it! ✅" or "Still
  practising 💪". That self-report becomes `selfAssessedCorrect` in the `/api/reviews`
  request; the grading path is chosen by the item's own tags/type, never by anything the
  client sends, so a child can't sidestep grading. `reviewEvents` gained a `selfAssessed`
  boolean (migration `drizzle/0004_spotty_iron_lad.sql`) to keep this distinguishable from
  auto-graded events for future reporting/audit.
- A content fix that fell out of this work: two of the four `multi_part` items in the whole
  bank (`E3LY03_Y3_009`'s purpose/audience question, `E3LA04_Y3_008`'s sentence/reason
  question) had at least one genuinely subjective sub-answer that no per-part exact match
  could fairly grade — tagged `open_response` so they route to self-assessment instead. The
  other two `multi_part` items (numeric/single-word sub-answers) needed no changes and are
  now auto-graded normally.
- `sessionBuilder.ts`'s item-pool query no longer excludes `multi_part` or `open_response`
  items — only `reviewStatus: "flagged"` items are excluded now (unchanged from the content
  review workflow). `drag_drop`/`matching` question types still don't appear simply because
  no content of those types exists yet, not because of any exclusion rule.

**Verified**: all three grading paths tested directly against a running dev server — a fully
correct multi_part submission, a partially-correct one (confirmed `partsCorrect` correctly
flags the wrong part and `correct: false` overall, 0 points), an open_response submission
missing `selfAssessedCorrect` (correctly rejected with 400), and one with it supplied
(correctly recorded with `selfAssessed: true` in the database). Confirmed via a targeted
`buildTodaySession` sweep that all 4 multi_part items in the bank now appear in real sessions
with the right payload shape — `answerFields` present but `stepByStepSolution` withheld for
the two auto-graded ones, both present for the two open_response ones. A plain short_answer
item was re-tested to confirm the original grading path is unaffected. `tsc --noEmit`,
production `next build`, and a regression pass across `/api/children`, `/api/gamification`,
`/api/dashboard`, `/api/reports/monthly`, `/api/topics`, and `/api/focus-topic` all stayed
clean, and all test review events/skill states were cleaned up afterward.

## Year 3 full-syllabus plan (in progress)

Chandana asked for the full Year 3 Maths + English syllabus (not just Term 1), plus a new
parent-facing "assign a focus topic" feature alongside the automatic daily session. Before
generating content at that scale, a curriculum-accuracy check against the real Australian
Curriculum v9.0 Year 3 content descriptors (ACARA/QCAA) found that Term 1's 10-week sequence
already touches nearly the entire year's content descriptor set (21/23 Maths, 26/28 English)
— so "the rest of the year" is mostly about *depth progression* per term, not new topics,
plus 4 small content-descriptor gaps and finishing Term 1's remaining item banks first. The
full plan — term-by-term depth progression tables for every strand, the 4 gaps to fill, and
the topic-assignment feature's proposed shape — is written up in this project's
`claude/year3-full-syllabus-plan.md` doc. Current status: **the full Year 3 curriculum
(Terms 1-4, Weeks 1-10) is now complete** — 151 skills, 1,522 items, both subjects; the 4
content-descriptor gaps (`AC9M3M03`, `AC9M3M06`, `AC9E3LY04`, `AC9E3LY05`) are filled and
deepened across the year (see "Curriculum content: Terms 2-4" above). The Terms 2-4 skill
design differs in some details from that doc's original depth-progression table (a few
proposed "Term 2" skills turned out to already be covered by Term 1 Weeks 7-10, so genuinely
new/deepened skills were substituted) but keeps its spirit: deepen existing strands, fill the
4 gaps, and land on ~16 new skills per term per subject. The topic-assignment ("focus topic")
feature described in that doc is now built — see "Focus topic feature" above.

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

- Real item banks — **the full Year 3 curriculum is now done** (1,522 items across 151
  skills, Terms 1-4, Weeks 1-10, both subjects). The human-review workflow now exists (see
  "Content review workflow" above) but the review itself hasn't been done yet — every item is
  still `reviewStatus: "pending"`. Year 4+ content is not yet designed.
- Stripe subscriptions, free trial gating.
- Gamification: a visual "progress map" (spatial/adventure-style, beyond the badge shelf) is
  still open; badges are only evaluated on demand (no push notification when one's earned
  outside an active session).
- Monthly report *emailing* — generation + an in-app printable view exist (`/parent/reports`);
  actually sending it (scheduled, via email) needs an email service (e.g. Resend, SES) not yet
  wired up.
