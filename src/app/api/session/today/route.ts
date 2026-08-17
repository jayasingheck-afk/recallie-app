import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { buildTodaySession } from "@/lib/sessionBuilder";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
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
    return NextResponse.json({
      sessionId: existing[0].id,
      status: existing[0].status,
      plannedItemIds: existing[0].plannedItemIds,
      completedItemIds: existing[0].completedItemIds,
      reused: true,
    });
  }

  const built = await buildTodaySession({
    childId,
    subject,
    yearLevel: child[0].yearLevel,
    term: 1,
    week: 1, // TODO: derive from child's enrolment start date once that's tracked
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
