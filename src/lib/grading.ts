/**
 * MVP answer grading. Handles the "short_answer" and "multiple_choice"
 * question types used by the current sample item bank. Normalizes
 * whitespace/case/punctuation for forgiving string comparison.
 *
 * This is a deliberately simple grader for the dev scaffold — production
 * item types (multi_part, drag_drop, matching) will need type-specific
 * comparators, and free-text English responses (e.g. short written
 * answers) may eventually need rubric-based or human/AI-assisted marking
 * rather than exact match.
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
