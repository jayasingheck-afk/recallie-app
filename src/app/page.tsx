import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-white px-6 py-20">
      <div className="w-full max-w-2xl text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-600">
          Recallie · dev build
        </p>
        <h1 className="mb-4 text-4xl font-bold text-slate-900">
          A little practice every day builds big skills.
        </h1>
        <p className="mb-10 text-lg text-slate-600">
          Short, encouraging Maths and English sessions for Australian primary students —
          built on spaced repetition, interleaving and retrieval practice.
        </p>

        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/child"
            className="rounded-2xl border border-sky-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md"
          >
            <div className="mb-2 text-2xl">🧒</div>
            <div className="text-lg font-semibold text-slate-900">Child practice</div>
            <p className="text-sm text-slate-500">
              Today&apos;s Maths &amp; English session (demo child: Alex, Year 3, NSW).
            </p>
          </Link>
          <Link
            href="/parent/dashboard"
            className="rounded-2xl border border-emerald-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md"
          >
            <div className="mb-2 text-2xl">👪</div>
            <div className="text-lg font-semibold text-slate-900">Parent dashboard</div>
            <p className="text-sm text-slate-500">
              Skills mastered and areas to give more attention for Alex.
            </p>
          </Link>
        </div>

        <p className="text-xs text-slate-400">
          This is an early scaffold — no sign-in yet, so it always uses the seeded demo family
          (parent/child) from the database. Auth (Clerk), payments (Stripe), and the full item
          bank come next.
        </p>
      </div>
    </div>
  );
}
