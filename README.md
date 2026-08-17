# Recallie — dev scaffold

Early build-out of the Recallie app, per the project's tech-stack and pedagogy docs.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **PostgreSQL** + **Drizzle ORM** (see note below on why Drizzle instead of Prisma)
- No auth/payments yet — everything runs against one seeded demo parent/child

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

Visit `/child` for the child practice flow and `/parent/dashboard` for the parent view.
Both currently hard-code the seeded demo child (`demo_child_1` — "Alex", Year 3, NSW);
there's no login yet.

## What's implemented

- **`src/db/schema.ts`** — full data model: User, ParentChildLink, Skill,
  CurriculumSequenceEntry, ChildSkillState, ReviewEvent, Item, Session, Subscription.
- **`src/lib/spacedRepetition.ts`** — the FSRS-inspired scheduler from the project docs
  (stability/difficulty/lapses → next review interval + status).
- **`src/lib/sessionBuilder.ts`** — daily session assembly: ~40% review / ~35% new /
  ~25% mixed, interleaved so no more than 2 consecutive items share a skill.
- **`src/lib/grading.ts`** — simple string-match grading for `short_answer` /
  `multiple_choice` items (MVP only — see comments for what's missing).
- **API routes**: `GET /api/session/today`, `POST /api/reviews`, `GET /api/dashboard`.
- **UI**: `/child` (one-item-at-a-time practice with hints + feedback), `/parent/dashboard`
  (skills mastered / areas to give more attention / recent sessions).
- **Seed data**: full Year 3 Term 1 curriculum (55 skills, both subjects, VIC+NSW mappings)
  from the project docs; a small hand-written sample item bank (8 items, Week 1 skills only)
  for exercising the app — **not** a real item bank (see next steps).

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
- Real item banks — only 8 sample items exist (Week 1 only). Use the Maths/English
  item-generation prompts in the project docs, generate + human-review, then import.
- Stripe subscriptions, free trial gating.
- Deriving the child's current curriculum week from an actual enrolment date
  (currently hard-coded to term 1 / week 1 in the session API).
- Gamification beyond points/streak (badges, progress map).
- Monthly parent report generation/email.
