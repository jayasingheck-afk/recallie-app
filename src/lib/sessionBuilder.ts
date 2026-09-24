/**
 * Daily session builder.
 *
 * Implements the algorithm from the project's session-builder design doc:
 *  1. Determine session capacity (item count) for the child's year level.
 *  2. Build candidate pools: due/priority review skills, this week's new
 *     curriculum skills, and previously-learned "mixed" skills for
 *     interleaving.
 *  3. Allocate item slots ~40% review / ~35% new / ~25% mixed.
 *  4. Order items so no more than 2 consecutive items share a skill.
 *
 * This is an MVP implementation: it works against whatever Items exist in
 * the bank (currently Weeks 1-3 skills — see src/db/seed/sample-items.json,
 * week1-item-bank.json, week2-item-bank.json, week3-item-bank.json). As more weeks are generated
 * and imported, pool sizes will grow and sessions will fill out naturally —
 * no changes needed here, since skills/items are looked up generically by
 * term+week (curriculumWeek.ts controls how far a child is allowed to roll
 * forward via MAX_AVAILABLE_WEEK).
 * Item pool queries exclude "multi_part" question types and items tagged
 * "open_response" — the MVP grader (src/lib/grading.ts) can't auto-mark them.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { childSkillStates, curriculumSequenceEntries, items, skills } from "@/db/schema";

type ItemRow = typeof items.$inferSelect;
import { getYearConfig, SESSION_COMPOSITION } from "./yearConfig";
import { initializeSkillState } from "./spacedRepetition";

export type SessionItem = {
  itemId: string;
  skillId: string;
  skillDescription: string;
  questionText: string;
  passage: string | null;
  questionType: string;
  difficulty: string;
  hints: string[];
  tags: string[];
  slotType: "review" | "new" | "mixed";
};

export type BuildSessionParams = {
  childId: string;
  subject: "maths" | "english";
  yearLevel: number;
  term?: number;
  week?: number;
  now?: Date;
};

export type BuildSessionResult = {
  plannedItemIds: string[];
  items: SessionItem[];
  breakdown: { review: number; new: number; mixed: number; target: number };
};

const NEAR_DUE_WINDOW_DAYS = 2;

async function pickItemsForSkills(
  skillIds: string[],
  perSkill: number,
  excludeItemIds: Set<string>
): Promise<Record<string, ItemRow[]>> {
  const result: Record<string, ItemRow[]> = {};
  for (const skillId of skillIds) {
    const rows = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.skillId, skillId),
          // MVP grader only reliably auto-marks single-value short_answer /
          // multiple_choice items. Exclude question types and tags it can't
          // grade yet (multi_part has object-valued answer keys; open_response
          // items have no single correct answer). See week1-item-bank.json's
          // _note for the source of this rule.
          ne(items.questionType, "multi_part"),
          sql`NOT (${items.tags} @> ARRAY['open_response']::text[])`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(perSkill + excludeItemIds.size); // over-fetch a little in case of exclusions
    result[skillId] = rows.filter((r) => !excludeItemIds.has(r.id)).slice(0, perSkill);
    for (const r of result[skillId]) excludeItemIds.add(r.id);
  }
  return result;
}

/** Interleave items so no more than 2 consecutive items share a skillId. */
function interleave(bucketsBySkill: Map<string, SessionItem[]>): SessionItem[] {
  const queues = Array.from(bucketsBySkill.values()).filter((q) => q.length > 0);
  const out: SessionItem[] = [];
  let lastSkill: string | null = null;
  let lastSkillStreak = 0;

  while (queues.some((q) => q.length > 0)) {
    // Sort queues by remaining length desc each pass so bigger queues get spread out.
    queues.sort((a, b) => b.length - a.length);
    let placed = false;
    for (const q of queues) {
      if (q.length === 0) continue;
      const candidate = q[0];
      const wouldRepeat = candidate.skillId === lastSkill && lastSkillStreak >= 2;
      if (wouldRepeat) continue;
      out.push(q.shift()!);
      if (candidate.skillId === lastSkill) {
        lastSkillStreak += 1;
      } else {
        lastSkill = candidate.skillId;
        lastSkillStreak = 1;
      }
      placed = true;
      break;
    }
    if (!placed) {
      // Every remaining queue's head would repeat the same skill 3x in a row;
      // just place one anyway (small pools make strict interleaving impossible).
      const q = queues.find((q) => q.length > 0);
      if (!q) break;
      const candidate = q.shift()!;
      out.push(candidate);
      lastSkill = candidate.skillId;
      lastSkillStreak = candidate.skillId === lastSkill ? lastSkillStreak + 1 : 1;
    }
  }
  return out;
}

export async function buildTodaySession(params: BuildSessionParams): Promise<BuildSessionResult> {
  const { childId, subject, yearLevel } = params;
  const now = params.now ?? new Date();
  const term = params.term ?? 1;
  const week = params.week ?? 1;

  const { items: targetN } = getYearConfig(yearLevel);
  const nReview = Math.round(targetN * SESSION_COMPOSITION.review);
  const nNew = Math.round(targetN * SESSION_COMPOSITION.new);
  const nMixed = targetN - nReview - nNew;

  const nearDueCutoff = new Date(now.getTime() + NEAR_DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // 1. Child's existing per-skill state, joined to skill metadata for this subject.
  const childStates = await db
    .select({ state: childSkillStates, skill: skills })
    .from(childSkillStates)
    .innerJoin(skills, eq(childSkillStates.skillId, skills.id))
    .where(and(eq(childSkillStates.childId, childId), eq(skills.subject, subject)));

  const knownSkillIds = new Set(childStates.map((r) => r.skill.id));

  const dueOrPriority = childStates
    .filter((r) => r.state.status === "needs_attention" || r.state.nextReviewAt <= nearDueCutoff)
    .sort((a, b) => {
      // needs_attention first, then lowest stability (weakest) first
      if (a.state.status === "needs_attention" && b.state.status !== "needs_attention") return -1;
      if (b.state.status === "needs_attention" && a.state.status !== "needs_attention") return 1;
      return a.state.stabilityDays - b.state.stabilityDays;
    });

  const stableMixedCandidates = childStates.filter(
    (r) => r.state.status !== "needs_attention" && r.state.nextReviewAt > nearDueCutoff
  );

  // 2. This week's curriculum "new" skills (not yet started by this child).
  const seqEntry = await db
    .select()
    .from(curriculumSequenceEntries)
    .where(
      and(
        eq(curriculumSequenceEntries.subject, subject),
        eq(curriculumSequenceEntries.yearLevel, yearLevel),
        eq(curriculumSequenceEntries.term, term),
        eq(curriculumSequenceEntries.week, week)
      )
    )
    .limit(1);

  const weekSkillIds = seqEntry[0]?.skillIds ?? [];
  const newSkillIds = weekSkillIds.filter((id) => !knownSkillIds.has(id));

  // 3. Pick skill sets for each slot type (cap how many distinct skills we touch
  //    so we get a few items per skill rather than 1 item each).
  const reviewSkillIds = dueOrPriority.slice(0, Math.max(2, Math.ceil(nReview / 2))).map((r) => r.skill.id);
  const focusNewSkillIds = newSkillIds.slice(0, 2); // 1-2 focus skills per session, per doc
  const mixedSkillIds = stableMixedCandidates
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(2, Math.ceil(nMixed / 2)))
    .map((r) => r.skill.id);

  const usedItemIds = new Set<string>();

  const reviewItemsBySkill = reviewSkillIds.length
    ? await pickItemsForSkills(reviewSkillIds, Math.max(1, Math.ceil(nReview / Math.max(1, reviewSkillIds.length))), usedItemIds)
    : {};
  const newItemsBySkill = focusNewSkillIds.length
    ? await pickItemsForSkills(focusNewSkillIds, Math.max(1, Math.ceil(nNew / Math.max(1, focusNewSkillIds.length))), usedItemIds)
    : {};
  const mixedItemsBySkill = mixedSkillIds.length
    ? await pickItemsForSkills(mixedSkillIds, Math.max(1, Math.ceil(nMixed / Math.max(1, mixedSkillIds.length))), usedItemIds)
    : {};

  // If review/mixed pools came up short (e.g. brand-new child, tiny item bank),
  // backfill remaining slots from new-skill items so the session isn't empty.
  const skillDescById = new Map(childStates.map((r) => [r.skill.id, r.skill.canonicalDescription]));
  const newSkillRows = focusNewSkillIds.length
    ? await db.select().from(skills).where(inArray(skills.id, focusNewSkillIds))
    : [];
  for (const s of newSkillRows) skillDescById.set(s.id, s.canonicalDescription);

  const buckets = new Map<string, SessionItem[]>();

  function addBucket(bySkill: Record<string, any[]>, slotType: SessionItem["slotType"]) {
    for (const [skillId, rows] of Object.entries(bySkill)) {
      const list: SessionItem[] = rows.map((r: any) => ({
        itemId: r.id,
        skillId,
        skillDescription: skillDescById.get(skillId) ?? skillId,
        questionText: r.questionText,
        passage: r.passage ?? null,
        questionType: r.questionType,
        difficulty: r.difficulty,
        hints: r.hints ?? [],
        tags: r.tags ?? [],
        slotType,
      }));
      if (list.length) buckets.set(`${slotType}:${skillId}`, list);
    }
  }

  addBucket(reviewItemsBySkill, "review");
  addBucket(newItemsBySkill, "new");
  addBucket(mixedItemsBySkill, "mixed");

  const ordered = interleave(buckets);

  const counts = { review: 0, new: 0, mixed: 0 };
  for (const it of ordered) counts[it.slotType]++;

  return {
    plannedItemIds: ordered.map((i) => i.itemId),
    items: ordered,
    breakdown: { ...counts, target: targetN },
  };
}

/** Ensures a ChildSkillState row exists for a skill (lazy-initialized on first exposure). */
export async function ensureChildSkillState(childId: string, skillId: string) {
  const existing = await db
    .select()
    .from(childSkillStates)
    .where(and(eq(childSkillStates.childId, childId), eq(childSkillStates.skillId, skillId)))
    .limit(1);

  if (existing[0]) return existing[0];

  const init = initializeSkillState();
  const [created] = await db
    .insert(childSkillStates)
    .values({
      childId,
      skillId,
      stabilityDays: init.stabilityDays,
      difficulty: init.difficulty,
      lapses: init.lapses,
      reviewCount: init.reviewCount,
      recentAccuracy3: init.recentAccuracy3 ?? undefined,
      status: init.status,
      nextReviewAt: new Date(),
    })
    .returning();
  return created;
}
