"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Fallback when no ?childId= is given (e.g. someone bookmarked the report directly).
const DEMO_CHILD_ID = "demo_child_1";

type Badge = {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
};

type SkillSummary = {
  skillId: string;
  subject: string;
  strand: string;
  description: string;
  statusLabel: string;
  reviewCount: number;
};

type MonthlyReportData = {
  child: { id: string; displayName: string; yearLevel: number; state: string };
  period: {
    year: number;
    month: number;
    label: string;
    isCurrentMonth: boolean;
    daysElapsed: number;
    daysInMonth: number;
  };
  practice: {
    sessionsCompleted: number;
    itemsAnswered: number;
    itemsCorrect: number;
    accuracyPct: number | null;
    practiceDays: number;
    pointsEarned: number;
    bySubject: Record<string, { answered: number; correct: number }>;
  };
  badgesEarnedThisMonth: Badge[];
  snapshot: {
    pointsAsOfLabel: string;
    totalPoints: number;
    currentStreakDays: number;
    skillsAsOfLabel: string;
    skillsMastered: SkillSummary[];
    areasToGiveMoreAttention: SkillSummary[];
    onTrack: SkillSummary[];
    stillBuilding: SkillSummary[];
  };
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SkillCard({ s }: { s: SkillSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {s.subject} · {s.strand}
        </span>
        <span className="text-xs text-slate-400">{s.reviewCount} reviews</span>
      </div>
      <p className="text-sm text-slate-800">{s.description}</p>
    </div>
  );
}

function ParentReportsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const childId = searchParams.get("childId") || DEMO_CHILD_ID;

  const now = new Date();
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);

  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/reports/monthly?childId=${childId}&year=${year}&month=${month}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load report");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [childId, year, month]);

  function goToMonth(deltaMonths: number) {
    let newMonth = month + deltaMonths;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    router.push(`/parent/reports?childId=${childId}&year=${newYear}&month=${newMonth}`);
  }

  const isFutureMonth =
    year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const subjects = Object.keys(data.practice.bySubject);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 print:px-0 print:py-4">
      <div className="mb-1 flex items-center justify-between print:hidden">
        <Link href={`/parent/dashboard?childId=${childId}`} className="text-sm text-sky-600 hover:underline">
          ← Back to dashboard
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          🖨️ Print / Save as PDF
        </button>
      </div>

      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {data.child.displayName}&apos;s monthly report
      </h1>
      <p className="mb-1 text-sm text-slate-500">
        Year {data.child.yearLevel} · {data.child.state}
      </p>

      <div className="mb-6 flex items-center gap-3 print:mb-4">
        <button
          onClick={() => goToMonth(-1)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 print:hidden"
        >
          ← Prev
        </button>
        <span className="text-lg font-semibold text-slate-800">{data.period.label}</span>
        <button
          onClick={() => goToMonth(1)}
          disabled={isFutureMonth}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 print:hidden"
        >
          Next →
        </button>
        {data.period.isCurrentMonth && (
          <span className="text-xs text-slate-400">
            (in progress — day {data.period.daysElapsed} of {data.period.daysInMonth})
          </span>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Practice this month</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Sessions completed" value={data.practice.sessionsCompleted} />
          <StatTile
            label="Days practised"
            value={`${data.practice.practiceDays} / ${data.period.daysElapsed}`}
          />
          <StatTile label="Points earned" value={`⭐ ${data.practice.pointsEarned}`} />
          <StatTile label="Questions answered" value={data.practice.itemsAnswered} />
          <StatTile label="Questions correct" value={data.practice.itemsCorrect} />
          <StatTile
            label="Accuracy"
            value={data.practice.accuracyPct === null ? "—" : `${data.practice.accuracyPct}%`}
          />
        </div>

        {subjects.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {subjects.map((subj) => {
              const s = data.practice.bySubject[subj];
              return (
                <div key={subj} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{subj}</p>
                  <p className="text-sm text-slate-800">
                    {s.correct}/{s.answered} correct
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {data.practice.itemsAnswered === 0 && (
          <p className="mt-3 text-sm text-slate-500">
            No practice recorded for {data.period.label} yet.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Badges earned this month</h2>
        {data.badgesEarnedThisMonth.length === 0 ? (
          <p className="text-sm text-slate-500">
            No new badges this month — every practice session still builds skills, badges or not.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.badgesEarnedThisMonth.map((b) => (
              <div key={b.key} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <div className="mb-1 text-2xl">{b.emoji}</div>
                <p className="text-xs font-semibold text-slate-700">{b.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-emerald-700">
          🏆 Skills mastered
          <span className="text-sm font-normal text-slate-400">
            ({data.snapshot.skillsMastered.length}, as of {data.snapshot.skillsAsOfLabel})
          </span>
        </h2>
        {data.snapshot.skillsMastered.length === 0 ? (
          <p className="text-sm text-slate-500">
            No skills marked as mastered yet — keep practising, they&apos;ll show up here soon.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.snapshot.skillsMastered.map((s) => (
              <SkillCard key={s.skillId} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-700">
          🎯 Areas to give more attention
          <span className="text-sm font-normal text-slate-400">
            ({data.snapshot.areasToGiveMoreAttention.length}, as of {data.snapshot.skillsAsOfLabel})
          </span>
        </h2>
        {data.snapshot.areasToGiveMoreAttention.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing needs extra attention right now — great work!</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.snapshot.areasToGiveMoreAttention.map((s) => (
              <SkillCard key={s.skillId} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          Lifetime totals{" "}
          <span className="text-sm font-normal text-slate-400">(as of {data.snapshot.pointsAsOfLabel})</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Total points" value={`⭐ ${data.snapshot.totalPoints}`} />
          <StatTile
            label="Streak"
            value={`🔥 ${data.snapshot.currentStreakDays} ${data.snapshot.currentStreakDays === 1 ? "day" : "days"}`}
          />
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 print:mt-4">
        Recallie — a little practice every day builds big skills 🌱
      </p>
    </div>
  );
}

export default function ParentReportsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <ParentReportsInner />
    </Suspense>
  );
}
