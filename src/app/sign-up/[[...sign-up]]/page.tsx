const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function SignUpPage() {
  if (!clerkConfigured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-slate-500">
        Sign-up isn&apos;t set up yet — Recallie is running in demo mode.
      </div>
    );
  }
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <SignUp />
    </div>
  );
}
