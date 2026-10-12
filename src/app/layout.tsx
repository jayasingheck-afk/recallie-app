import type { Metadata } from "next";
import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recallie",
  description:
    "Recallie helps primary school students build lasting maths and English skills through short, encouraging daily practice.",
};

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2 text-sm">
          <Link href="/" className="font-semibold text-slate-700">
            🏠 Recallie
          </Link>
          {clerkConfigured && (
            <div className="ml-auto flex items-center gap-3">
              <AuthControls />
            </div>
          )}
        </header>
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
