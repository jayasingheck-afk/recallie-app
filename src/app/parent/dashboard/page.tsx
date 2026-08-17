"use client";

import { useEffect, useState } from "react";

const DEMO_CHILD_ID = "demo_child_1";

type SkillSummary = {
  skillId: string;
  subject: string;
  strand: string;
  description: string;
  statusLabel: string;
  reviewCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
};

type DashboardData = {
  child: { id: string; displayName: string; yearLevel: number; state: string };
  skillsMastered: SkillSummary[];
  areasToGiveMoreAttention: SkillSummary[];
  onTrack: SkillSummary[];
  recentSessions: {
    id: string;
    date: string;
    subject: string;
    status: string;
    itemsCompleted: number;
    itemsPlanned: number;
  }[];
};

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

export default function ParentDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard?childId=${DEMO_CHILD_ID}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {data.child.displayName}&apos;s progress
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        Year {data.child.yearLevel} · {data.child.state}
      </p>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-emerald-700">
          🏆 Skills mastered
          <span className="text-sm font-normal text-slate-400">({data.skillsMastered.length})</span>
        </h2>
        {data.skillsMastered.length === 0 ? (
          <p className="text-sm text-slate-500">
            No skills marked as mastered yet — keep practising, they&apos;ll show up here soon.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.skillsMastered.map((s) => (
              <SkillCard key={s.skillId} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-700">
          🎯 Areas to give more attention
          <span className="text-sm font-normal text-slate-400">
            ({data.areasToGiveMoreAttention.length})
          </span>
        </h2>
        {data.areasToGiveMoreAttention.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing needs extra attention right now — great work!</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.areasToGiveMoreAttention.map((s) => (
              <SkillCard key={s.skillId} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          On track <span className="text-sm font-normal text-slate-400">({data.onTrack.length})</span>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.onTrack.map((s) => (
            <SkillCard key={s.skillId} s={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Recent sessions</h2>
        {data.recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions completed yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Subject</th>
                <th className="py-1 font-medium">Progress</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSessions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2">{new Date(s.date).toLocaleDateString("en-AU")}</td>
                  <td className="py-2 capitalize">{s.subject}</td>
                  <td className="py-2">
                    {s.itemsCompleted}/{s.itemsPlanned}
                  </td>
                  <td className="py-2 capitalize">{s.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
