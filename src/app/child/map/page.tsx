"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const DEMO_CHILD_ID = "demo_child_1";

type Stop = {
  term: number;
  week: number;
  status: "completed" | "current" | "locked";
  skillsTotal: number;
  skillsMastered: number;
  skillDescriptions: string[];
};

type ProgressMap = {
  child: { id: string; displayName: string | null };
  currentTerm: number;
  currentWeek: number;
  maxTerm: number;
  maxWeek: number;
  stops: Stop[];
};

// Purely decorative — an "adventure" theme layered on top of the real
// term/week data, not a claim about curriculum content. Chosen once per
// term/week so reloading the page doesn't reshuffle the map.
const TERM_CHAPTER: Record<number, string> = {
  1: "🌳 The Learning Forest",
  2: "🐊 River Crossing",
  3: "⛰️ Mountain Trail",
  4: "🏰 Castle Summit",
};
const WEEK_ICONS = ["🌿", "🪨", "🌊", "🎯", "⛺", "⭐", "🔑", "💎", "🧭", "🎁"];

function weekIcon(week: number) {
  return WEEK_ICONS[(week - 1) % WEEK_ICONS.length];
}

function ProgressMapInner() {
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") || DEMO_CHILD_ID;
  const [data, setData] = useState<ProgressMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/progress-map?childId=${childId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load progress map");
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Start with the current stop already expanded — that's the one the child cares about.
        setExpandedKey(`${d.currentTerm}-${d.currentWeek}`);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [childId]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🗺️ Your Learning Journey</h1>
          {data?.child.displayName && <p className="text-sm text-slate-500">{data.child.displayName}&apos;s path so far</p>}
        </div>
        <Link
          href={`/child?childId=${childId}`}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200"
        >
          ← Back to today
        </Link>
      </div>

      {loading && <p className="text-slate-500">Loading your journey…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {data && (
        <div className="relative pl-8">
          {/* The connecting trail line, drawn once behind every stop. */}
          <div className="absolute bottom-4 left-4 top-4 w-1 rounded-full bg-slate-200" aria-hidden="true" />

          {Array.from({ length: data.maxTerm }, (_, i) => i + 1).map((term) => (
            <div key={term} className="mb-2">
              <h2 className="relative z-10 mb-3 ml-[-2rem] text-sm font-bold text-slate-500">
                {TERM_CHAPTER[term] ?? `Term ${term}`}
              </h2>
              {Array.from({ length: data.maxWeek }, (_, i) => i + 1).map((week) => {
                const stop = data.stops.find((s) => s.term === term && s.week === week);
                if (!stop) return null;
                const key = `${term}-${week}`;
                const isExpanded = expandedKey === key;
                const isMilestone = week === 5 || week === data.maxWeek;

                const circleClasses =
                  stop.status === "current"
                    ? "bg-sky-500 text-white ring-4 ring-sky-200 animate-pulse"
                    : stop.status === "completed"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-400";

                return (
                  <div key={key} className="relative mb-3">
                    <button
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                      className="relative z-10 flex w-full items-center gap-3 text-left"
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                          isMilestone ? "h-12 w-12 text-xl" : ""
                        } ${circleClasses}`}
                      >
                        {stop.status === "locked" ? "🔒" : weekIcon(week)}
                      </span>
                      <span className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <span className="block text-sm font-semibold text-slate-800">
                          Week {week}
                          {stop.status === "current" && (
                            <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                              📍 You are here!
                            </span>
                          )}
                        </span>
                        {stop.status !== "locked" && stop.skillsTotal > 0 && (
                          <span className="block text-xs text-slate-400">
                            {stop.skillsMastered}/{stop.skillsTotal} skills mastered so far
                          </span>
                        )}
                        {stop.status === "locked" && <span className="block text-xs text-slate-400">Not reached yet</span>}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="relative z-10 ml-[3.25rem] mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                        {stop.status === "locked" ? (
                          <p>🔒 Keep practising to unlock this stretch of the journey!</p>
                        ) : stop.skillDescriptions.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-4">
                            {stop.skillDescriptions.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No skills recorded for this week yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <p className="relative z-10 mt-4 text-center text-sm text-slate-400">
            🏁 That&apos;s the whole of Year 3 — more adventures coming as new content is added!
          </p>
        </div>
      )}
    </div>
  );
}

export default function ProgressMapPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <ProgressMapInner />
    </Suspense>
  );
}
