import { NextRequest, NextResponse } from "next/server";

/**
 * Protects /parent routes once Clerk is configured (see currentParent.ts).
 * Until then this is a pure passthrough — no behaviour change in demo mode.
 */
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

async function buildClerkMiddleware() {
  const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");
  const isProtectedRoute = createRouteMatcher(["/parent(.*)"]);
  return clerkMiddleware(async (auth, req) => {
    if (isProtectedRoute(req)) {
      await auth.protect();
    }
  });
}

// Built once at module load, only when Clerk is actually configured, so the
// `@clerk/nextjs/server` import (which reads env vars) is never exercised in
// demo mode.
const clerkMiddlewarePromise = clerkConfigured ? buildClerkMiddleware() : null;

export default async function middleware(req: NextRequest, event: any) {
  if (!clerkConfigured || !clerkMiddlewarePromise) {
    return NextResponse.next();
  }
  const handler = await clerkMiddlewarePromise;
  return handler(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|json)$).*)",
  ],
};
