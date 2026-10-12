"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

/**
 * Sign in / user menu shown in the header once Clerk is configured.
 *
 * Deliberately a Client Component using the `useUser()` hook rather than
 * Clerk's <SignedIn>/<SignedOut> server control components. Those control
 * components read auth state via request headers set by the Clerk
 * middleware/proxy — which only runs for real HTTP requests, never during
 * `next build`'s static generation of Next's built-in special pages (like
 * the default /_not-found page, which every layout wraps automatically).
 * That mismatch broke production builds with:
 *   "Error: Clerk: <SignedOut> is not available in @clerk/nextjs Core 3."
 * `useUser()` instead resolves client-side after hydration, so it has
 * nothing to do at build time and the static /_not-found export succeeds.
 * See build failure on Vercel, Oct 2026 (commit 5611b73 redeploy attempt).
 */
export function AuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  // Nothing to show until Clerk has resolved auth state client-side —
  // avoids a flash of the wrong state on first paint.
  if (!isLoaded) return null;

  if (isSignedIn) {
    return <UserButton />;
  }

  return (
    <SignInButton mode="modal">
      <button className="rounded-lg bg-sky-600 px-3 py-1.5 font-medium text-white">Sign in</button>
    </SignInButton>
  );
}
