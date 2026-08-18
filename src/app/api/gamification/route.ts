import { NextRequest, NextResponse } from "next/server";
import { getGamificationSummary } from "@/lib/gamification";

/**
 * GET /api/gamification?childId=...
 *
 * Lifetime points, current daily practice streak, and badge shelf (earned +
 * locked, so the UI can tease "3 more correct to unlock"). Used by the child
 * page (to show real, persisted totals instead of resetting every session)
 * and the parent dashboard.
 */
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId query param is required" }, { status: 400 });
  }

  const { stats, badges } = await getGamificationSummary(childId);

  return NextResponse.json({
    totalPoints: stats.totalPoints,
    currentStreakDays: stats.currentStreakDays,
    totalSessionsCompleted: stats.totalSessionsCompleted,
    badges,
  });
}
