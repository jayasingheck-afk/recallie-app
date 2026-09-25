"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// Fallback when no ?childId= is given (e.g. someone bookmarked the dashboard directly).
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

type Badge = {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
};

type FocusTopic = {
  skillId: string;
  subject: string;
  description: string;
  assignedAt: string | null;
} | null;

type DashboardData = {
  child: { id: string; displayName: string; yearLevel: number; state: string };
  skillsMastered: SkillSummary[];
  areasToGiveMoreAttention: SkillSummary[];
  onTrack: SkillSummary[];
  stillBuilding: SkillSummary[];
  points: number;
  currentStreakDays: number;
  badges: Badge[];
  focusTopic: FocusTopic;
  recentSessions: {
    id: string;
    date: string;
    subject: string;
    status: string;
    itemsCompleted: number;
    itemsPlanned: number;
  }[];
};

type TopicTree = { subject: string; yearLevel: number; strands: { strand: string; skills: { id: string; description: string }[] }[] };

function SkillCard({ s, onAssignFocus }: { s: SkillSummary; onAssignFocus?: (skillId: string) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {s.subject} · {s.strand}
        </span>
        <span className="text-xs text-slate-400">{s.reviewCount} reviews</span>
      </div>
      <p className="text-sm text-slate-800">{s.description}</p>
      {onAssignFocus && (
        <button
          onClick={() => onAssignFocus(s.skillId)}
          className="mt-2 text-xs font-medium text-sky-600 hover:underline"
        >
          Assign as focus topic
        </button>
      )}
    </div>
  );
}

function FocusTopicSection({ childId, focusTopic, onChanged }: { childId: string; focusTopic: FocusTopic; onChanged: () => void }) {
  const [subject, setSubject] = useState<"maths" | "english">("maths");
  const [tree, setTree] = useState<TopicTree | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTree(null);
    setSelectedSkillId("");
    fetch(`/api/topics?subject=${subject}`)
      .then((res) => res.json())
      .then(setTree)
      .catch(() => setTree(null));
  }, [subject]);

  async function assign(skillId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/focus-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, skillId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not assign focus topic");
      setNotice(`Focus topic set to "${data.description}" — it'll show up in their next ${data.subject} session.`);
      onChanged();
    } catch (err: any) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/focus-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, skillId: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not clear focus topic");
      setNotice("Focus topic cleared.");
      onChanged();
    } catch (err: any) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-sky-800">🎯 Focus topic</h2>
      <p className="mb-3 text-sm text-sky-700">
        Pick a specific skill to give extra practice on — it gets blended into their next daily
        session alongside the usual review and new-learning mix, so there's still just one
        session to do.
      </p>

      {focusTopic ? (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-sky-200 bg-white p-3">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Currently assigned · {focusTopic.subject}
            </span>
            <p className="text-sm text-slate-800">{focusTopic.description}</p>
          </div>
          <button
            onClick={clear}
            disabled={busy}
            className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No focus topic assigned right now.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value as "maths" | "english")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="maths">Maths</option>
          <option value="english">English</option>
        </select>
        <select
          value={selectedSkillId}
          onChange={(e) => setSelectedSkillId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">
            {tree ? "Choose a skill to assign…" : "Loading skills…"}
          </option>
          {tree?.strands.map((s) => (
            <optgroup key={s.strand} label={s.strand}>
              {s.skills.map((sk) => (
                <option key={sk.id} value={sk.id}>
                  {sk.description}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => selectedSkillId && assign(selectedSkillId)}
          disabled={!selectedSkillId || busy}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Assign
        </button>
      </div>
      {notice && <p className="mt-2 text-sm text-sky-700">{notice}</p>}
    </section>
  );
}

function ParentDashboardInner() {
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") || DEMO_CHILD_ID;
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickAssignNotice, setQuickAssignNotice] = useState<string | null>(null);

  function loadDashboard() {
    setError(null);
    fetch(`/api/dashboard?childId=${childId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setData(null);
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function quickAssignFocus(skillId: string, description: string) {
    setQuickAssignNotice(null);
    try {
      const res = await fetch("/api/focus-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, skillId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not assign focus topic");
      setQuickAssignNotice(`Focus topic set to "${description}".`);
      loadDashboard();
    } catch (err: any) {
      setQuickAssignNotice(err.message);
    }
  }

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          {data.child.displayName}&apos;s progress
        </h1>
        <div className="flex gap-4">
          <Link href={`/child/map?childId=${childId}`} className="text-sm text-sky-600 hover:underline">
            🗺️ Journey map
          </Link>
          <Link href={`/parent/reports?childId=${childId}`} className="text-sm text-sky-600 hover:underline">
            Monthly report
          </Link>
          <Link href="/parent/children" className="text-sm text-sky-600 hover:underline">
            Manage children
          </Link>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Year {data.child.yearLevel} · {data.child.state}
      </p>

      <div className="mb-8 flex flex-wrap gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total points</p>
          <p className="text-xl font-bold text-slate-900">⭐ {data.points}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Practice streak</p>
          <p className="text-xl font-bold text-slate-900">
            🔥 {data.currentStreakDays} {data.currentStreakDays === 1 ? "day" : "days"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Badges earned</p>
          <p className="text-xl font-bold text-slate-900">
            🏅 {data.badges.filter((b) => b.earned).length}/{data.badges.length}
          </p>
        </div>
      </div>

      <FocusTopicSection childId={childId} focusTopic={data.focusTopic} onChanged={loadDashboard} />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Badges</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.badges.map((b) => (
            <div
              key={b.key}
              className={`rounded-xl border p-3 text-center ${
                b.earned ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-60"
              }`}
              title={b.description}
            >
              <div className="mb-1 text-2xl">{b.earned ? b.emoji : "🔒"}</div>
              <p className="text-xs font-semibold text-slate-700">{b.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

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
        {quickAssignNotice && <p className="mb-2 text-sm text-sky-700">{quickAssignNotice}</p>}
        {data.areasToGiveMoreAttention.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing needs extra attention right now — great work!</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.areasToGiveMoreAttention.map((s) => (
              <SkillCard
                key={s.skillId}
                s={s}
                onAssignFocus={(skillId) => quickAssignFocus(skillId, s.description)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-sky-700">
          🌱 Still building
          <span className="text-sm font-normal text-slate-400">({data.stillBuilding.length})</span>
        </h2>
        {data.stillBuilding.length === 0 ? (
          <p className="text-sm text-slate-500">No newly-started skills right now.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-400">
              New skills, practised recently and doing fine — just not reviewed enough times yet to call &quot;on
              track&quot;.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.stillBuilding.map((s) => (
                <SkillCard key={s.skillId} s={s} />
              ))}
            </div>
          </>
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

export default function ParentDashboardPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <ParentDashboardInner />
    </Suspense>
  );
}
