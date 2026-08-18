import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { computeMonthlyReport } from "@/lib/monthlyReport";

/**
 * GET /api/reports/monthly?childId=...&year=YYYY&month=1-12
 *
 * year/month default to the current calendar month. See monthlyReport.ts
 * for what's genuinely period-limited (points, sessions, badges earned that
 * month) vs. a live snapshot (skills mastered / areas to give more
 * attention, which have no history table to look back on).
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

  const now = new Date();
  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year must be an integer and month an integer 1-12" }, { status: 400 });
  }

  const report = await computeMonthlyReport(childId, year, month, now);

  return NextResponse.json({
    child: { id: child[0].id, displayName: child[0].displayName, yearLevel: child[0].yearLevel, state: child[0].state },
    ...report,
  });
}
