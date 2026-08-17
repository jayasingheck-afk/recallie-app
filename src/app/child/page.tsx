"use client";

import { useEffect, useState } from "react";

const DEMO_CHILD_ID = "demo_child_1";

type SessionItem = {
  itemId: string;
  skillId: string;
  skillDescription: string;
  questionText: string;
  passage: string | null;
  questionType: string;
  difficulty: string;
  hints: string[];
  tags: string[];
  slotType: "review" | "new" | "mixed";
};

type ReviewFeedback = {
  correct: boolean;
  stepByStepSolution: string[];
  commonMisconceptions: string[];
  skillStatusLabel: string;
};

const SLOT_LABEL: Record<SessionItem["slotType"], string> = {
  review: "Warm-up review",
  new: "New learning",
  mixed: "Mix it up",
};

export default function ChildSessionPage() {
  const [subject, setSubject] = useState<"maths" | "english">("maths");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIndex(0);
    setFeedback(null);
    setAnswer("");
    setHintsShown(0);

    fetch(`/api/session/today?childId=${DEMO_CHILD_ID}&subject=${subject}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load session");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSessionItems(data.items ?? []);
        setStartedAt(Date.now());
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [subject]);

  const current = sessionItems[index];
  const isDone = !loading && sessionItems.length > 0 && index >= sessionItems.length;

  async function submitAnswer() {
    if (!current) return;
    setSubmitting(true);
    const responseTimeSec = (Date.now() - startedAt) / 1000;
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: DEMO_CHILD_ID,
          itemId: current.itemId,
          submittedAnswer: answer,
          attempts: 1,
          hintUsed: hintsShown > 0,
          responseTimeSec,
          slotType: current.slotType,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not submit answer");
      const data: ReviewFeedback = await res.json();
      setFeedback(data);
      if (data.correct) {
        setPoints((p) => p + (hintsShown > 0 ? 5 : 10));
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function nextItem() {
    setIndex((i) => i + 1);
    setAnswer("");
    setHintsShown(0);
    setFeedback(null);
    setStartedAt(Date.now());
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Hi Alex! 👋</h1>
        <div className="flex gap-2">
          {(["maths", "english"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${
                subject === s ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
        <span>⭐ {points} points</span>
        <span>🔥 {streak} in a row</span>
        {sessionItems.length > 0 && (
          <span className="ml-auto">
            {Math.min(index + 1, sessionItems.length)} / {sessionItems.length}
          </span>
        )}
      </div>

      {sessionItems.length > 0 && (
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(Math.min(index, sessionItems.length) / sessionItems.length) * 100}%` }}
          />
        </div>
      )}

      {loading && <p className="text-slate-500">Loading today&apos;s mission…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && sessionItems.length === 0 && (
        <p className="text-slate-500">
          No items available yet for this subject — the item bank is still being built. Try Maths
          (Week 1 has sample items seeded).
        </p>
      )}

      {!loading && current && !isDone && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              {SLOT_LABEL[current.slotType]}
            </span>
            <span className="text-xs text-slate-400">{current.skillDescription}</span>
          </div>

          {current.passage && (
            <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{current.passage}</p>
          )}

          <p className="mb-4 text-lg font-medium text-slate-900">{current.questionText}</p>

          {!feedback && (
            <>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer…"
                className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && answer && submitAnswer()}
              />

              {current.hints.length > 0 && (
                <div className="mb-3">
                  {hintsShown < current.hints.length ? (
                    <button
                      onClick={() => setHintsShown((h) => h + 1)}
                      className="text-sm font-medium text-amber-600 hover:underline"
                    >
                      💡 Show a hint ({hintsShown}/{current.hints.length} used)
                    </button>
                  ) : null}
                  {current.hints.slice(0, hintsShown).map((h, i) => (
                    <p key={i} className="mt-1 text-sm text-amber-700">
                      Hint {i + 1}: {h}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={submitAnswer}
                disabled={!answer || submitting}
                className="w-full rounded-lg bg-sky-600 py-2 font-semibold text-white disabled:opacity-40"
              >
                {submitting ? "Checking…" : "Check my answer"}
              </button>
            </>
          )}

          {feedback && (
            <div
              className={`rounded-xl p-4 ${
                feedback.correct ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
              }`}
            >
              <p className="mb-2 font-semibold">
                {feedback.correct ? "Nice work — that's correct! 🎉" : "Good try — let's see how to get there:"}
              </p>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
                {feedback.stepByStepSolution.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {!feedback.correct && feedback.commonMisconceptions.length > 0 && (
                <p className="mb-3 text-xs italic">{feedback.commonMisconceptions[0]}</p>
              )}
              <button
                onClick={nextItem}
                className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {isDone && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-2 text-4xl">🌟</div>
          <h2 className="mb-1 text-xl font-bold text-emerald-900">Mission complete!</h2>
          <p className="text-emerald-800">
            You earned {points} points today and got {streak > 0 ? `a ${streak}-answer streak` : "great practice in"}.
            Keep it up, Alex!
          </p>
        </div>
      )}
    </div>
  );
}
