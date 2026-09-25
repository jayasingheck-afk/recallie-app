"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// Fallback when no ?childId= is given (e.g. someone bookmarked /child directly).
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
  answerFields?: string[]; // "multi_part" items only — one labelled input per key
  stepByStepSolution?: string[]; // "open_response" items only — the model answer, shown up front for self-marking
  commonMisconceptions?: string[];
};

type ReviewFeedback = {
  correct: boolean;
  partsCorrect?: Record<string, boolean>;
  stepByStepSolution: string[];
  commonMisconceptions: string[];
  skillStatusLabel: string;
  pointsEarned: number;
};

// Turns a multi_part answer-key field like "largest" or "a" into a readable
// input label ("Largest", "(a)") — the question text itself already spells
// out what each part is asking, so this just needs to be a clear pointer to
// which box goes with which part, not a full restatement.
function fieldLabel(key: string): string {
  if (/^[a-z]$/i.test(key)) return `(${key})`;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

type Badge = {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
};

type GamificationSummary = {
  totalPoints: number;
  currentStreakDays: number;
  badges: Badge[];
};

const SLOT_LABEL: Record<SessionItem["slotType"], string> = {
  review: "Warm-up review",
  new: "New learning",
  mixed: "Mix it up",
};

function ChildSessionInner() {
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") || DEMO_CHILD_ID;
  const [subject, setSubject] = useState<"maths" | "english">("maths");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [multiPartAnswers, setMultiPartAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false); // "open_response" items: has the model answer been shown yet?
  const [hintsShown, setHintsShown] = useState(0);
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [sessionPoints, setSessionPoints] = useState(0);
  const [answerStreak, setAnswerStreak] = useState(0);
  const [gamification, setGamification] = useState<GamificationSummary | null>(null);
  const [newBadge, setNewBadge] = useState<Badge | null>(null);
  const [alreadyCompletedToday, setAlreadyCompletedToday] = useState(false);

  function refreshGamification() {
    fetch(`/api/gamification?childId=${childId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GamificationSummary | null) => {
        if (!data) return;
        setGamification((prev) => {
          if (prev) {
            const justEarned = data.badges.find(
              (b) => b.earned && !prev.badges.find((pb) => pb.key === b.key)?.earned
            );
            if (justEarned) setNewBadge(justEarned);
          }
          return data;
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshGamification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIndex(0);
    setFeedback(null);
    setAnswer("");
    setMultiPartAnswers({});
    setRevealed(false);
    setHintsShown(0);
    setAlreadyCompletedToday(false);

    fetch(`/api/session/today?childId=${childId}&subject=${subject}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load session");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const fetchedItems = data.items ?? [];
        setSessionItems(fetchedItems);
        // A reused session that's already fully completed today comes back
        // with status "completed" and no remaining items — distinct from
        // "no content exists yet for this subject" (plannedItemIds is empty).
        setAlreadyCompletedToday(
          data.status === "completed" && fetchedItems.length === 0 && (data.plannedItemIds?.length ?? 0) > 0
        );
        setStartedAt(Date.now());
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [subject, childId]);

  const current = sessionItems[index];
  const isDone = !loading && sessionItems.length > 0 && index >= sessionItems.length;
  const isOpenResponse = current?.tags.includes("open_response") ?? false;
  const isMultiPart = !isOpenResponse && current?.questionType === "multi_part";
  const multiPartComplete =
    !isMultiPart || (current?.answerFields ?? []).every((f) => (multiPartAnswers[f] ?? "").trim().length > 0);

  async function postReview(extra: { submittedAnswer?: unknown; selfAssessedCorrect?: boolean }) {
    if (!current) return;
    setSubmitting(true);
    const responseTimeSec = (Date.now() - startedAt) / 1000;
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          itemId: current.itemId,
          attempts: 1,
          hintUsed: hintsShown > 0,
          responseTimeSec,
          slotType: current.slotType,
          ...extra,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not submit answer");
      const data: ReviewFeedback = await res.json();
      setFeedback(data);
      if (data.correct) {
        setSessionPoints((p) => p + data.pointsEarned);
        setAnswerStreak((s) => s + 1);
      } else {
        setAnswerStreak(0);
      }
      refreshGamification();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function submitAnswer() {
    postReview({ submittedAnswer: isMultiPart ? multiPartAnswers : answer });
  }

  // "open_response" items: no exact-match grading exists, so instead of
  // submitting straight away, the child first reveals the model answer
  // (already included in the session payload for these items — see
  // sessionBuilder.ts) and then honestly self-marks. selfAssess() is what
  // actually submits, carrying that self-report as selfAssessedCorrect.
  function selfAssess(correct: boolean) {
    postReview({ submittedAnswer: answer, selfAssessedCorrect: correct });
  }

  function nextItem() {
    setIndex((i) => i + 1);
    setAnswer("");
    setMultiPartAnswers({});
    setRevealed(false);
    setHintsShown(0);
    setFeedback(null);
    setStartedAt(Date.now());
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hi there! 👋</h1>
          <Link href="/parent/children" className="text-xs text-slate-400 hover:underline">
            Switch child
          </Link>
        </div>
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

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span>⭐ {sessionPoints} today</span>
        <span>🔥 {answerStreak} in a row</span>
        {gamification && (
          <>
            <span className="text-slate-300">·</span>
            <span>🌟 {gamification.totalPoints} total</span>
            <span>
              📅 {gamification.currentStreakDays}{" "}
              {gamification.currentStreakDays === 1 ? "day" : "days"} streak
            </span>
          </>
        )}
        {sessionItems.length > 0 && (
          <span className="ml-auto">
            {Math.min(index + 1, sessionItems.length)} / {sessionItems.length}
          </span>
        )}
      </div>

      {newBadge && (
        <button
          onClick={() => setNewBadge(null)}
          className="mb-4 w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-800 shadow-sm"
        >
          {newBadge.emoji} New badge unlocked: {newBadge.label}! <span className="font-normal">(tap to dismiss)</span>
        </button>
      )}

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

      {!loading && !error && sessionItems.length === 0 && !alreadyCompletedToday && (
        <p className="text-slate-500">
          No items available yet for this subject — the item bank is still being built. Try Maths
          (Week 1 has sample items seeded).
        </p>
      )}

      {!loading && !error && alreadyCompletedToday && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-2 text-4xl">✅</div>
          <h2 className="mb-1 text-xl font-bold text-emerald-900">Already done for today!</h2>
          <p className="text-emerald-800">
            You finished today&apos;s {subject} mission. Come back tomorrow for a fresh one, or switch
            subjects above.
          </p>
        </div>
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

          {!feedback && isMultiPart && (
            <div className="mb-3 space-y-2">
              {(current.answerFields ?? []).map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{fieldLabel(field)}</label>
                  <input
                    value={multiPartAnswers[field] ?? ""}
                    onChange={(e) => setMultiPartAnswers((prev) => ({ ...prev, [field]: e.target.value }))}
                    placeholder="Type your answer…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {!feedback && !isMultiPart && !isOpenResponse && (
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer…"
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && answer && submitAnswer()}
            />
          )}

          {!feedback && isOpenResponse && !revealed && (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Have a go — write your answer here…"
              rows={3}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          )}

          {!feedback && (isOpenResponse ? !revealed : true) && current.hints.length > 0 && (
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

          {!feedback && !isOpenResponse && (
            <button
              onClick={submitAnswer}
              disabled={(isMultiPart ? !multiPartComplete : !answer) || submitting}
              className="w-full rounded-lg bg-sky-600 py-2 font-semibold text-white disabled:opacity-40"
            >
              {submitting ? "Checking…" : "Check my answer"}
            </button>
          )}

          {!feedback && isOpenResponse && !revealed && (
            <button
              onClick={() => setRevealed(true)}
              className="w-full rounded-lg bg-sky-600 py-2 font-semibold text-white"
            >
              Show me the model answer
            </button>
          )}

          {!feedback && isOpenResponse && revealed && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">Here&apos;s one good way to answer it:</p>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {(current.stepByStepSolution ?? []).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p className="mb-3 text-sm font-medium text-slate-900">
                Compare it with what you wrote — how did you go?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => selfAssess(true)}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 font-semibold text-white disabled:opacity-40"
                >
                  I got it! ✅
                </button>
                <button
                  onClick={() => selfAssess(false)}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-amber-500 py-2 font-semibold text-white disabled:opacity-40"
                >
                  Still practising 💪
                </button>
              </div>
            </div>
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
              {feedback.partsCorrect && (
                <ul className="mb-3 space-y-0.5 text-sm">
                  {Object.entries(feedback.partsCorrect).map(([part, ok]) => (
                    <li key={part}>
                      {ok ? "✅" : "🔁"} {fieldLabel(part)}
                    </li>
                  ))}
                </ul>
              )}
              {!isOpenResponse && (
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
                  {feedback.stepByStepSolution.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
              {!feedback.correct && !isOpenResponse && feedback.commonMisconceptions.length > 0 && (
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
            You earned {sessionPoints} points today and got{" "}
            {answerStreak > 0 ? `a ${answerStreak}-answer streak` : "great practice in"}. Keep it up!
          </p>
          {gamification && (
            <p className="mt-2 text-sm text-emerald-700">
              🌟 {gamification.totalPoints} points overall · 📅 {gamification.currentStreakDays}{" "}
              {gamification.currentStreakDays === 1 ? "day" : "days"} streak
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChildSessionPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <ChildSessionInner />
    </Suspense>
  );
}
