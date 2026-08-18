import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, parentChildLinks } from "@/db/schema";
import { getCurrentParentId, isAuthConfigured } from "@/lib/currentParent";

/**
 * Parent onboarding: add-a-child + list-children.
 *
 * The acting parent is resolved server-side via getCurrentParentId() — the
 * seeded demo parent until Clerk is configured, or the signed-in user once
 * it is. Earlier versions of this route trusted a client-supplied parentId,
 * which meant anyone could list or add children under any parent id just by
 * knowing/guessing it; deriving it from the session instead closes that.
 */

const VALID_STATES = ["VIC", "NSW"] as const;
const CONTENT_YEAR_LEVELS = [3]; // only Year 3 has real curriculum content so far

// GET /api/children
export async function GET() {
  const parentId = await getCurrentParentId();
  if (!parentId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select({ child: users, link: parentChildLinks })
    .from(parentChildLinks)
    .innerJoin(users, eq(parentChildLinks.childId, users.id))
    .where(eq(parentChildLinks.parentId, parentId));

  return NextResponse.json({
    children: rows.map((r) => ({
      id: r.child.id,
      displayName: r.child.displayName,
      yearLevel: r.child.yearLevel,
      state: r.child.state,
      enrolledAt: r.child.enrolledAt,
    })),
  });
}

// POST /api/children  { displayName, yearLevel, state }
export async function POST(req: NextRequest) {
  const parentId = await getCurrentParentId();
  if (!parentId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { displayName, yearLevel, state } = body as {
    displayName?: string;
    yearLevel?: number;
    state?: string;
  };

  if (!displayName || !yearLevel || !state) {
    return NextResponse.json(
      { error: "displayName, yearLevel, and state are all required" },
      { status: 400 }
    );
  }
  if (!VALID_STATES.includes(state as any)) {
    return NextResponse.json({ error: `state must be one of ${VALID_STATES.join(", ")}` }, { status: 400 });
  }
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
    return NextResponse.json({ error: "yearLevel must be an integer from 1 to 6" }, { status: 400 });
  }

  const parent = await db.select().from(users).where(eq(users.id, parentId)).limit(1);
  if (!parent[0]) {
    return NextResponse.json({ error: `No parent found with id ${parentId}` }, { status: 404 });
  }

  const now = new Date();
  const [child] = await db
    .insert(users)
    .values({
      // Children don't sign in themselves in the MVP, so there's no real
      // Clerk user for them — this placeholder just needs to be unique.
      clerkUserId: isAuthConfigured() ? `child_${parentId}_${now.getTime()}` : `pending_${parentId}_${now.getTime()}`,
      email: parent[0].email,
      role: "child",
      state,
      yearLevel,
      displayName,
      enrolledAt: now,
    })
    .returning();

  await db.insert(parentChildLinks).values({
    parentId,
    childId: child.id,
    relationship: "parent",
  });

  return NextResponse.json({
    child: {
      id: child.id,
      displayName: child.displayName,
      yearLevel: child.yearLevel,
      state: child.state,
      enrolledAt: child.enrolledAt,
    },
    hasContent: CONTENT_YEAR_LEVELS.includes(yearLevel),
  });
}
