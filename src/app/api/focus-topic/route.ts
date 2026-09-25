import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, skills } from "@/db/schema";
import { verifyChildAccess } from "@/lib/currentParent";

/**
 * Parent-assigned "focus topic": a parent picks a specific skill (via
 * /api/topics for the browsing list) and it gets blended into that child's
 * next daily session for the matching subject, alongside the usual
 * review/new/mixed mix — see sessionBuilder.ts's "focus" slot. This is
 * intentionally simple: one active assignment per child at a time, no
 * history table, persists until the parent changes or clears it.
 */

// GET /api/focus-topic?childId=...
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId query param is required" }, { status: 400 });
  }

  const access = await verifyChildAccess(childId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db
    .select({ child: users, skill: skills })
    .from(users)
    .leftJoin(skills, eq(users.assignedFocusSkillId, skills.id))
    .where(eq(users.id, childId))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: `No child found with id ${childId}` }, { status: 404 });
  }

  const { child, skill } = rows[0];
  if (!child.assignedFocusSkillId || !skill) {
    return NextResponse.json({ assigned: false });
  }

  return NextResponse.json({
    assigned: true,
    skillId: skill.id,
    subject: skill.subject,
    strand: skill.strand,
    description: skill.canonicalDescription,
    assignedAt: child.assignedFocusSetAt,
  });
}

// POST /api/focus-topic  { childId, skillId }  — skillId: null clears the assignment
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { childId, skillId } = body as { childId?: string; skillId?: string | null };
  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  const access = await verifyChildAccess(childId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (skillId === null || skillId === undefined) {
    await db
      .update(users)
      .set({ assignedFocusSkillId: null, assignedFocusSetAt: null, updatedAt: new Date() })
      .where(eq(users.id, childId));
    return NextResponse.json({ assigned: false });
  }

  const skillRow = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
  if (!skillRow[0]) {
    return NextResponse.json({ error: `No skill found with id ${skillId}` }, { status: 404 });
  }

  const now = new Date();
  await db
    .update(users)
    .set({ assignedFocusSkillId: skillId, assignedFocusSetAt: now, updatedAt: now })
    .where(eq(users.id, childId));

  return NextResponse.json({
    assigned: true,
    skillId: skillRow[0].id,
    subject: skillRow[0].subject,
    strand: skillRow[0].strand,
    description: skillRow[0].canonicalDescription,
    assignedAt: now,
  });
}
