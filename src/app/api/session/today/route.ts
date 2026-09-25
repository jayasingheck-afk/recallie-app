import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { items, sessions, skills, users } from "@/db/schema";
import { buildTodaySession } from "@/lib/sessionBuilder";
import { computeCurrentTermWeek } from "@/lib/curriculumWeek";
import { verifyChildAccess } from "@/lib/currentParent";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Re-fetches full item details for an already-built session (the "reused"
 * path below only has plannedItemIds/completedItemIds on the Session row,
 * not the full question content). Returns them in the original planned
 * order, skipping anything already completed so a child reloading mid-day
 * continues where they left off instead of redoing finished items.
 *
 * Note: the review/new/mixed slotType chosen when the session was first
 * built isn't persisted per-item, so hydrated items default to "review" for
 * that label — a cosmetic simplification, not a correctness issue.
 */
async function hydrateRemainingItems(plannedItemIds: string[], completedItemIds: string[]) {
  const remainingIds = plannedItemIds.filter((id) => !completedItemIds.includes(id));
  if (remainingIds.length === 0) return [];

  const rows = await db
    .select({ item: items, skill: skills })
    .from(items)
    .innerJoin(skills, eq(items.skillId, skills.id))
    .where(inArray(items.id, remainingIds));

  const byId = new Map(rows.map((r) => [r.item.id, r]));
  return remainingIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => {
      const tags = r.item.tags ?? [];
      const isOpenResponse = tags.includes("open_response");
      return {
        itemId: r.item.id,
        skillId: r.item.skillId,
        skillDescription: r.skill.canonicalDescription,
        questionText: r.item.questionText,
        passage: r.item.passage ?? null,
        questionType: r.item.questionType,
        difficulty: r.item.difficulty,
        hints: r.item.hints ?? [],
        tags,
        slotType: "review" as const,
        answerFields:
          r.item.questionType === "multi_part" ? Object.keys((r.item.answerKey as object) ?? {}) : undefined,
        stepByStepSolution: isOpenResponse ? r.item.stepByStepSolution ?? [] : undefined,
        commonMisconceptions: isOpenResponse ? r.item.commonMisconceptions ?? [] : undefined,
      };
    });
}

/**
 * GET /api/session/today?childId=...&subject=maths|english
 *
 * Builds (or returns the already-built) daily session for a child+subject,
 * per the session-builder design: ~40% review, ~35% new learning, ~25%
 * mixed/interleaved practice, ordered to avoid 3+ consecutive same-skill
 * items. Idempotent per calendar day: calling again the same day returns
 * the same planned session rather than reshuffling it.
 */
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get("childId");
  const subject = req.nextUrl.searchParams.get("subject") as "maths" | "english" | null;

  if (!childId || !subject || !["maths", "english"].includes(subject)) {
    return NextResponse.json(
      { error: "childId and subject ('maths' | 'english') query params are required" },
      { status: 400 }
    );
  }

  const access = await verifyChildAccess(childId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const child = await db.select().from(users).where(eq(users.id, childId)).limit(1);
  if (!child[0]) {
    return NextResponse.json({ error: `No child found with id ${childId}` }, { status: 404 });
  }
  if (!child[0].yearLevel) {
    return NextResponse.json({ error: `Child ${childId} has no yearLevel set` }, { status: 400 });
  }

  const today = startOfDay(new Date());

  const existing = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.childId, childId), eq(sessions.date, today), eq(sessions.subject, subject)))
    .limit(1);

  if (existing[0] && existing[0].plannedItemIds.length > 0) {
    const remainingItems = await hydrateRemainingItems(
      existing[0].plannedItemIds,
      existing[0].completedItemIds
    );
    return NextResponse.json({
      sessionId: existing[0].id,
      status: existing[0].status,
      items: remainingItems,
      plannedItemIds: existing[0].plannedItemIds,
      completedItemIds: existing[0].completedItemIds,
      reused: true,
    });
  }

  const { term, week } = computeCurrentTermWeek(child[0].enrolledAt);

  const built = await buildTodaySession({
    childId,
    subject,
    yearLevel: child[0].yearLevel,
    term,
    week,
  });

  const [session] = existing[0]
    ? await db
        .update(sessions)
        .set({ plannedItemIds: built.plannedItemIds, updatedAt: new Date() })
        .where(eq(sessions.id, existing[0].id))
        .returning()
    : await db
        .insert(sessions)
        .values({
          childId,
          date: today,
          subject,
          plannedItemIds: built.plannedItemIds,
          completedItemIds: [],
          status: "in_progress",
        })
        .returning();

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    breakdown: built.breakdown,
    items: built.items,
    reused: false,
  });
}
