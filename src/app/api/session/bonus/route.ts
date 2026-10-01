import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { items, sessions, skills } from "@/db/schema";
import { buildBonusRound } from "@/lib/sessionBuilder";
import { verifyChildAccess } from "@/lib/currentParent";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Re-fetches full item details for an already-built bonus round that isn't
 * finished yet (mirrors today/route.ts's hydrateRemainingItems — see that
 * file's doc comment for why this is needed at all: the Session row only
 * stores bonusItemIds, not full question content).
 */
async function hydrateBonusItems(remainingIds: string[]) {
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
        slotType: "bonus" as const,
        answerFields:
          r.item.questionType === "multi_part" ? Object.keys((r.item.answerKey as object) ?? {}) : undefined,
        stepByStepSolution: isOpenResponse ? r.item.stepByStepSolution ?? [] : undefined,
        commonMisconceptions: isOpenResponse ? r.item.commonMisconceptions ?? [] : undefined,
      };
    });
}

/**
 * GET /api/session/bonus?childId=...&subject=maths|english
 *
 * Builds (or resumes) today's optional "bonus round" for a child+subject —
 * see claude/bonus-round-feature-spec.md. Gated on today's core session
 * being fully completed, and capped at one bonus round per subject per day
 * (enforced via sessions.bonusItemIds, which starts empty and is only ever
 * set once per day here). Never touches spaced-repetition scheduling: that
 * only happens for core-session reviews, not bonus ones — see
 * src/app/api/reviews/route.ts's isBonus handling.
 *
 * Year-level-generic by construction: it works from whatever skills/items
 * exist for this child's actual session, so it needs no special-casing to
 * "work for other years" — it already does, automatically, once that
 * year's curriculum content exists.
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

  const today = startOfDay(new Date());

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.childId, childId), eq(sessions.date, today), eq(sessions.subject, subject)))
    .limit(1);

  if (!session || session.status !== "completed") {
    return NextResponse.json(
      { error: "Finish today's core session first — then a bonus round will be available." },
      { status: 400 }
    );
  }

  // Already built today: resume it (or report it's already finished) rather
  // than building a second one — this is the one-bonus-round-per-day cap.
  if (session.bonusItemIds.length > 0) {
    const remaining = session.bonusItemIds.filter((id) => !session.bonusCompletedItemIds.includes(id));
    if (remaining.length === 0) {
      return NextResponse.json({
        sessionId: session.id,
        items: [],
        alreadyTaken: true,
      });
    }
    const remainingItems = await hydrateBonusItems(remaining);
    return NextResponse.json({
      sessionId: session.id,
      items: remainingItems,
      bonusItemIds: session.bonusItemIds,
      bonusCompletedItemIds: session.bonusCompletedItemIds,
      alreadyTaken: false,
      reused: true,
    });
  }

  // Which skills did today's core session actually cover? Read it back off
  // the planned items themselves rather than re-deriving slot allocation.
  const coreItems = session.plannedItemIds.length
    ? await db.select({ skillId: items.skillId }).from(items).where(inArray(items.id, session.plannedItemIds))
    : [];
  const coreSessionSkillIds = Array.from(new Set(coreItems.map((r) => r.skillId)));

  const built = await buildBonusRound({
    childId,
    subject,
    coreSessionSkillIds,
    excludeItemIds: session.plannedItemIds,
  });

  if (built.itemIds.length === 0) {
    return NextResponse.json({
      sessionId: session.id,
      items: [],
      alreadyTaken: false,
      error: "No extra items are available for a bonus round yet.",
    });
  }

  await db
    .update(sessions)
    .set({ bonusItemIds: built.itemIds, updatedAt: new Date() })
    .where(eq(sessions.id, session.id));

  return NextResponse.json({
    sessionId: session.id,
    items: built.items,
    bonusItemIds: built.itemIds,
    bonusCompletedItemIds: [],
    alreadyTaken: false,
    reused: false,
  });
}
