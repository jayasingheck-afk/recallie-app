import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { childSkillStates, curriculumSequenceEntries, skills, users } from "@/db/schema";
import { computeCurrentTermWeek, MAX_AVAILABLE_TERM, MAX_AVAILABLE_WEEK } from "@/lib/curriculumWeek";
import { verifyChildAccess } from "@/lib/currentParent";

type Stop = {
  term: number;
  week: number;
  status: "completed" | "current" | "locked";
  skillsTotal: number;
  skillsMastered: number;
  skillDescriptions: string[];
};

/**
 * GET /api/progress-map?childId=...
 *
 * Powers the child-facing "journey trail" (see /child/map): one stop per
 * curriculum week (Term 1 Week 1 through Term 4 Week 10 — the whole Year 3
 * curriculum, MAX_AVAILABLE_TERM/WEEK), each showing whether the child has
 * already passed that week, is on it right now, or hasn't reached it yet
 * (derived the same way sessionBuilder.ts does, via computeCurrentTermWeek),
 * plus how many of that week's skills the child has gone on to master —
 * mastery keeps growing on already-passed stops as spaced-repetition review
 * continues, it isn't frozen at "completed".
 *
 * No new schema: built entirely from curriculumSequenceEntries (which
 * skills are introduced each week, both subjects combined into one trail
 * since term/week is shared across subjects) and the child's existing
 * ChildSkillState rows.
 */
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId query param is required" }, { status: 400 });
  }

  const access = await verifyChildAccess(childId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [child] = await db.select().from(users).where(eq(users.id, childId)).limit(1);
  if (!child) {
    return NextResponse.json({ error: `No child found with id ${childId}` }, { status: 404 });
  }
  if (!child.yearLevel) {
    return NextResponse.json({ error: `Child ${childId} has no yearLevel set` }, { status: 400 });
  }

  const { term: currentTerm, week: currentWeek } = computeCurrentTermWeek(child.enrolledAt);

  const seqEntries = await db
    .select()
    .from(curriculumSequenceEntries)
    .where(eq(curriculumSequenceEntries.yearLevel, child.yearLevel));

  const allSkillIds = [...new Set(seqEntries.flatMap((e) => e.skillIds))];
  const skillRows = allSkillIds.length
    ? await db.select().from(skills).where(inArray(skills.id, allSkillIds))
    : [];
  const descriptionById = new Map(skillRows.map((s) => [s.id, s.canonicalDescription]));

  const childStates = await db.select().from(childSkillStates).where(eq(childSkillStates.childId, childId));
  const masteredSkillIds = new Set(childStates.filter((s) => s.status === "mastered").map((s) => s.skillId));

  const byTermWeek = new Map<string, string[]>(); // "term:week" -> skillIds (both subjects combined)
  for (const entry of seqEntries) {
    const key = `${entry.term}:${entry.week}`;
    byTermWeek.set(key, [...(byTermWeek.get(key) ?? []), ...entry.skillIds]);
  }

  const stops: Stop[] = [];
  for (let term = 1; term <= MAX_AVAILABLE_TERM; term++) {
    for (let week = 1; week <= MAX_AVAILABLE_WEEK; week++) {
      const skillIds = [...new Set(byTermWeek.get(`${term}:${week}`) ?? [])];
      const status: Stop["status"] =
        term < currentTerm || (term === currentTerm && week < currentWeek)
          ? "completed"
          : term === currentTerm && week === currentWeek
            ? "current"
            : "locked";
      stops.push({
        term,
        week,
        status,
        skillsTotal: skillIds.length,
        skillsMastered: skillIds.filter((id) => masteredSkillIds.has(id)).length,
        // Only worth sending descriptions for weeks the child can actually see details of —
        // keeps the payload small and avoids spoiling not-yet-reached content.
        skillDescriptions:
          status === "locked" ? [] : skillIds.map((id) => descriptionById.get(id) ?? id).sort(),
      });
    }
  }

  return NextResponse.json({
    child: { id: child.id, displayName: child.displayName },
    currentTerm,
    currentWeek,
    maxTerm: MAX_AVAILABLE_TERM,
    maxWeek: MAX_AVAILABLE_WEEK,
    stops,
  });
}
