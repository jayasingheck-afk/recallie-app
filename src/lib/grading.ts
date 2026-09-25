/**
 * Answer grading. Handles the "short_answer" and "multiple_choice" question
 * types (single-value answer keys) plus "multi_part" (an object of several
 * short exact sub-answers, e.g. `{ largest: "8520", smallest: "2058" }`) with
 * forgiving whitespace/case/punctuation-insensitive string comparison.
 *
 * Genuinely subjective free-text answers (a whole item tagged "open_response",
 * or a multi_part item where one or more sub-answers reads like a model
 * sentence rather than an exact value — see src/db/seed/week1-item-bank.json's
 * E3LY03_Y3_009/E3LA04_Y3_008 for examples) are NOT run through this exact
 * matcher at all: no string-comparison grader can fairly mark a Year 3
 * child's own wording of "what's the purpose of this text?" right or wrong.
 * Those are self-assessed instead — the child reveals the model answer/
 * step-by-step solution and honestly marks their own attempt — handled
 * entirely in src/app/api/reviews/route.ts and src/app/child/page.tsx, not
 * here. `drag_drop`/`matching` item types have no content yet and remain
 * excluded from live sessions (see sessionBuilder.ts).
 */
function normalize(value: unknown): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
}

export function checkAnswer(answerKey: unknown, submitted: unknown): boolean {
  if (Array.isArray(answerKey)) {
    return answerKey.some((k) => normalize(k) === normalize(submitted));
  }
  return normalize(answerKey) === normalize(submitted);
}

/**
 * Grades a "multi_part" item: `answerKey` is an object of sub-answers keyed
 * by part name (e.g. `{ a: "kilograms", b: "metres", c: "millilitres" }`).
 * Each part is graded independently with the same forgiving `checkAnswer`
 * logic (so a part's own answer key can itself be an array of accepted
 * alternatives), and the item as a whole counts as correct only if every
 * part does — matching the single boolean `correct` field the rest of the
 * app (spaced repetition, points, ReviewEvent) expects. `partsCorrect` is
 * returned alongside so the UI can give per-part feedback rather than just
 * one pass/fail for the whole question.
 */
export function checkMultiPartAnswer(
  answerKey: Record<string, unknown>,
  submitted: Record<string, unknown> | null | undefined
): { correct: boolean; partsCorrect: Record<string, boolean> } {
  const partsCorrect: Record<string, boolean> = {};
  for (const key of Object.keys(answerKey)) {
    partsCorrect[key] = checkAnswer(answerKey[key], submitted?.[key]);
  }
  const correct = Object.values(partsCorrect).every(Boolean);
  return { correct, partsCorrect };
}
