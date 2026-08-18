import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recallie",
  description:
    "Recallie helps primary school students build lasting maths and English skills through short, encouraging daily practice.",
};

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Only rendered once Clerk is configured — shows Sign in / a user menu using
 * Clerk's own components. Left out of the tree entirely in demo mode so
 * nothing here depends on Clerk actually being set up.
 */
async function AuthHeader() {
  const { SignedIn, SignedOut, SignInButton, UserButton } = await import("@clerk/nextjs");
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2 text-sm">
      <Link href="/" className="font-semibold text-slate-700">
        Recallie
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="rounded-lg bg-sky-600 px-3 py-1.5 font-medium text-white">Sign in</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {clerkConfigured ? <AuthHeader /> : null}
        {children}
      </body>
    </html>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  if (!clerkConfigured) {
    return <Shell>{children}</Shell>;
  }
  const { ClerkProvider } = await import("@clerk/nextjs");
  return (
    <ClerkProvider>
      <Shell>{children}</Shell>
    </ClerkProvider>
  );
}
