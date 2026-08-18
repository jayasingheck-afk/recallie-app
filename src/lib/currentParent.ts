/**
 * Resolves "which parent is acting right now" for server-side code (API
 * routes, server components).
 *
 * Auth is OPT-IN via environment variables: until a Clerk publishable key is
 * set, `isAuthConfigured()` is false and this falls back to the single
 * seeded demo parent, exactly matching the app's behaviour before this file
 * existed — so pulling this change in without Clerk keys set changes
 * nothing. Once NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (+ CLERK_SECRET_KEY) are
 * set in .env, real sign-in switches on automatically: middleware.ts starts
 * protecting /parent routes, and this function starts resolving the actual
 * signed-in Clerk user instead of the demo constant. See README "Auth
 * (Clerk)" for the account setup steps.
 */
import { db } from "@/db/client";
import { users, parentChildLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const DEMO_PARENT_ID = "demo_parent_1";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/**
 * Returns the internal User.id for the acting parent, or null if Clerk is
 * configured but nobody is signed in (the caller should respond 401/redirect).
 * When Clerk isn't configured yet, always returns the demo parent's id.
 */
export async function getCurrentParentId(): Promise<string | null> {
  if (!isAuthConfigured()) {
    return DEMO_PARENT_ID;
  }

  // Dynamic import so @clerk/nextjs/server (which reads env vars at import
  // time) is only ever touched on the path where Clerk is actually configured.
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (existing[0]) return existing[0].id;

  // First sign-in for this Clerk user: create our parent User row for them.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? `${clerkUserId}@no-email.recallie`;

  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email, role: "parent" })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  if (created) return created.id;

  // Lost a create race against a concurrent request for the same new user — re-fetch.
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return row?.id ?? null;
}

export type ChildAccessResult =
  | { ok: true; parentId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Verifies the acting parent (see getCurrentParentId) is actually linked to
 * the given child before a route hands back or mutates that child's data.
 *
 * Every child-scoped route (dashboard, session/today, reviews, gamification,
 * reports/monthly) accepts a childId param but has no other way to know
 * whether the caller should be allowed to see it — without this check,
 * anyone who could guess/enumerate a childId could view or answer on behalf
 * of a child that isn't theirs. In demo mode this always succeeds for the
 * seeded demo parent's own children (exactly the same children it could see
 * before this check existed); it only starts actually restricting access
 * once Clerk is configured and there's more than one real parent account.
 */
export async function verifyChildAccess(childId: string): Promise<ChildAccessResult> {
  const parentId = await getCurrentParentId();
  if (!parentId) {
    return { ok: false, status: 401, error: "Not signed in" };
  }

  const link = await db
    .select()
    .from(parentChildLinks)
    .where(and(eq(parentChildLinks.parentId, parentId), eq(parentChildLinks.childId, childId)))
    .limit(1);

  if (!link[0]) {
    return { ok: false, status: 403, error: "You don't have access to this child" };
  }

  return { ok: true, parentId };
}
