"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The acting parent is now resolved server-side (src/lib/currentParent.ts) —
// the demo parent until Clerk is configured, or the signed-in user once it
// is — so these requests no longer need to pass a parentId at all.

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const STATES = ["VIC", "NSW"] as const;
const CONTENT_YEAR_LEVELS = new Set([3]); // only Year 3 has real curriculum content so far

type Child = {
  id: string;
  displayName: string;
  yearLevel: number;
  state: string;
  enrolledAt: string | null;
};

export default function ParentChildrenPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [yearLevel, setYearLevel] = useState<number>(3);
  const [state, setState] = useState<(typeof STATES)[number]>("NSW");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function loadChildren() {
    setLoading(true);
    fetch(`/api/children`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load children");
        return res.json();
      })
      .then((data) => setChildren(data.children ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadChildren, []);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), yearLevel, state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add child");
      setDisplayName("");
      if (!data.hasContent) {
        setNotice(
          `${data.child.displayName} was added, but Year ${data.child.yearLevel} doesn't have practice content yet — only Year 3 is live right now.`
        );
      } else {
        setNotice(`${data.child.displayName} was added — ready to start practising!`);
      }
      loadChildren();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Your children</h1>
      <p className="mb-8 text-sm text-slate-500">
        Add a child to start their daily Maths and English practice.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mb-4 text-sm text-emerald-700">{notice}</p>}

      <section className="mb-10">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : children.length === 0 ? (
          <p className="text-sm text-slate-500">No children added yet — add your first one below.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {children.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{c.displayName}</p>
                <p className="mb-3 text-sm text-slate-500">
                  Year {c.yearLevel} · {c.state}
                </p>
                <div className="flex gap-3 text-sm">
                  <Link href={`/child?childId=${c.id}`} className="font-medium text-sky-600 hover:underline">
                    Start practice
                  </Link>
                  <Link
                    href={`/parent/dashboard?childId=${c.id}`}
                    className="font-medium text-slate-600 hover:underline"
                  >
                    View progress
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a child</h2>
        <form onSubmit={addChild} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Child&apos;s name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Year level</label>
              <select
                value={yearLevel}
                onChange={(e) => setYearLevel(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                    {!CONTENT_YEAR_LEVELS.has(y) ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value as (typeof STATES)[number])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={!displayName.trim() || submitting}
            className="w-full rounded-lg bg-sky-600 py-2 font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Adding…" : "Add child"}
          </button>
        </form>
      </section>
    </div>
  );
}
