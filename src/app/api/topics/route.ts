import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { skills } from "@/db/schema";

const CONTENT_YEAR_LEVELS = [3]; // only Year 3 has real curriculum content so far

/**
 * GET /api/topics?subject=maths|english&yearLevel=3
 *
 * Returns the strand -> skill tree for a subject, so a parent can browse
 * and pick a specific skill for the "focus topic" feature
 * (see /api/focus-topic and sessionBuilder.ts). No child/auth context
 * needed here — this just lists what content exists, same for every
 * family. Requires no schema beyond the existing `skills` table.
 */
export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  const yearLevelParam = req.nextUrl.searchParams.get("yearLevel");
  const yearLevel = yearLevelParam ? Number(yearLevelParam) : 3;

  if (!subject || !["maths", "english"].includes(subject)) {
    return NextResponse.json({ error: "subject query param ('maths' | 'english') is required" }, { status: 400 });
  }
  if (!CONTENT_YEAR_LEVELS.includes(yearLevel)) {
    return NextResponse.json({ strands: [], note: `Year ${yearLevel} has no practice content yet.` });
  }

  const rows = await db
    .select({
      id: skills.id,
      strand: skills.strand,
      description: skills.canonicalDescription,
    })
    .from(skills)
    .where(and(eq(skills.subject, subject), eq(skills.yearLevel, yearLevel)));

  const byStrand = new Map<string, { id: string; description: string }[]>();
  for (const row of rows) {
    const list = byStrand.get(row.strand) ?? [];
    list.push({ id: row.id, description: row.description });
    byStrand.set(row.strand, list);
  }

  const strands = Array.from(byStrand.entries())
    .map(([strand, skillsInStrand]) => ({
      strand,
      skills: skillsInStrand.sort((a, b) => a.description.localeCompare(b.description)),
    }))
    .sort((a, b) => a.strand.localeCompare(b.strand));

  return NextResponse.json({ subject, yearLevel, strands });
}
