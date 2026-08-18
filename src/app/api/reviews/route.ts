import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { childSkillStates, items, reviewEvents, sessions } from "@/db/schema";
import { ensureChildSkillState } from "@/lib/sessionBuilder";
import { updateSkillAfterReview, statusToParentLabel } from "@/lib/spacedRepetition";
import { checkAnswer } from "@/lib/grading";
import { pointsForAnswer } from "@/lib/gamification";

type ReviewBody = {
  childId: string;
  itemId: string;
  submittedAnswer: unknown;
  attempts?: number;
  hintUsed?: boolean;
  responseTimeSec: number;
  sessionId?: string;
  slotType?: "review" | "new" | "mixed";
};

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * POST /api/reviews
 *
 * Submits one item attempt: grades the answer, runs the spaced-repetition
 * update for the child+skill pair, logs a ReviewEvent, and marks the item
 * completed on today's Session (if one is in progress). Returns immediate,
 * constructive feedback (correct/incorrect + step-by-step solution) per the
 * retrieval-practice design — no "fail" language, just growth-oriented status.
 */
export async function POST(req: NextRequest) {
  let body: ReviewBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { childId, itemId, submittedAnswer, responseTimeSec } = body;
  const attempts = body.attempts ?? 1;
  const hintUsed = body.hintUsed ?? false;

  if (!childId || !itemId || responseTimeSec === undefined) {
    return NextResponse.json(
      { error: "childId, itemId, and responseTimeSec are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) {
    return NextResponse.json({ error: `No item found with id ${itemId}` }, { status: 404 });
  }

  const correct = checkAnswer(item.answerKey, submittedAnswer);

  // Ensure the child has a spaced-repetition state row for this skill (first exposure = lazy init).
  const currentState = await ensureChildSkillState(childId, item.skillId);

  const updated = updateSkillAfterReview(
    {
      stabilityDays: currentState.stabilityDays,
      difficulty: currentState.difficulty,
      lapses: currentState.lapses,
      reviewCount: currentState.reviewCount,
      recentAccuracy3: currentState.recentAccuracy3,
      status: currentState.status as "on_track" | "needs_attention" | "mastered",
    },
    { correct, attempts, hintUsed, responseTimeSec }
  );

  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + updated.nextReviewIntervalDays * 24 * 60 * 60 * 1000);

  await db
    .update(childSkillStates)
    .set({
      stabilityDays: updated.stabilityDays,
      difficulty: updated.difficulty,
      lapses: updated.lapses,
      reviewCount: updated.reviewCount,
      recentAccuracy3: updated.recentAccuracy3 ?? undefined,
      status: updated.status,
      lastReviewedAt: now,
      nextReviewAt,
      updatedAt: now,
    })
    .where(eq(childSkillStates.id, currentState.id));

  await db.insert(reviewEvents).values({
    childId,
    skillId: item.skillId,
    itemId: item.id,
    correct,
    attempts,
    hintUsed,
    responseTimeSec,
    isReview: body.slotType === "review",
    isMixed: body.slotType === "mixed",
  });

  // Mark the item completed on today's session, if one exists. A child can
  // have both a Maths and an English session on the same day, so match by
  // which session actually planned this item — not just "today" — otherwise
  // a review from one subject could get attributed to the other's session.
  const today = startOfDay(now);
  const todaysSessions = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.childId, childId), eq(sessions.date, today)));

  const todaySession = todaysSessions.find((s) => s.plannedItemIds.includes(itemId));

  if (todaySession && !todaySession.completedItemIds.includes(itemId)) {
    const completedItemIds = [...todaySession.completedItemIds, itemId];
    const allDone = todaySession.plannedItemIds.every((id) => completedItemIds.includes(id));
    await db
      .update(sessions)
      .set({
        completedItemIds,
        status: allDone ? "completed" : "in_progress",
        updatedAt: now,
      })
      .where(eq(sessions.id, todaySession.id));
  }

  return NextResponse.json({
    correct,
    stepByStepSolution: item.stepByStepSolution,
    commonMisconceptions: item.commonMisconceptions,
    skillStatus: updated.status,
    skillStatusLabel: statusToParentLabel(updated.status),
    nextReviewAt: nextReviewAt.toISOString(),
    pointsEarned: pointsForAnswer(correct, hintUsed),
  });
}
