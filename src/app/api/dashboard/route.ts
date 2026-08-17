import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { childSkillStates, sessions, skills, users } from "@/db/schema";
import { statusToParentLabel } from "@/lib/spacedRepetition";

/**
 * GET /api/dashboard?childId=...
 *
 * Parent-facing progress summary: skills mastered, "areas to give more
 * attention" (never "weaknesses" — see project tone guidelines), and
 * recent sessions. Numeric internal fields (stability/difficulty) are
 * included for admin/debug use but the UI should prefer skillStatusLabel.
 */
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId query param is required" }, { status: 400 });
  }

  const child = await db.select().from(users).where(eq(users.id, childId)).limit(1);
  if (!child[0]) {
    return NextResponse.json({ error: `No child found with id ${childId}` }, { status: 404 });
  }

  const states = await db
    .select({ state: childSkillStates, skill: skills })
    .from(childSkillStates)
    .innerJoin(skills, eq(childSkillStates.skillId, skills.id))
    .where(eq(childSkillStates.childId, childId));

  const recentSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.childId, childId))
    .orderBy(desc(sessions.date))
    .limit(10);

  const skillSummaries = states.map((r) => ({
    skillId: r.skill.id,
    subject: r.skill.subject,
    strand: r.skill.strand,
    description: r.skill.canonicalDescription,
    status: r.state.status,
    statusLabel: statusToParentLabel(r.state.status as any),
    reviewCount: r.state.reviewCount,
    lastReviewedAt: r.state.lastReviewedAt,
    nextReviewAt: r.state.nextReviewAt,
  }));

  return NextResponse.json({
    child: { id: child[0].id, displayName: child[0].displayName, yearLevel: child[0].yearLevel, state: child[0].state },
    skillsMastered: skillSummaries.filter((s) => s.status === "mastered"),
    areasToGiveMoreAttention: skillSummaries.filter((s) => s.status === "needs_attention"),
    onTrack: skillSummaries.filter((s) => s.status === "on_track"),
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      date: s.date,
      subject: s.subject,
      status: s.status,
      itemsCompleted: s.completedItemIds.length,
      itemsPlanned: s.plannedItemIds.length,
      timeSpentSec: s.timeSpentSec,
    })),
  });
}
