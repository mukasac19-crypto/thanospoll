import { QUESTIONS } from "./questions";

/** questionId -> chosen choiceId */
export type Answers = Record<string, string>;

/**
 * Order is fixed and deliberate, so there is no shuffling and no branching.
 * The jokes at positions 3, 6 and 9 break up the analytical spine, and the two
 * items that catch people out (press, then fifty) sit back to back so the
 * second one lands while the first is still fresh.
 */
export const ORDER: string[] = QUESTIONS.map((q) => q.id);

export const RUN_LENGTH = ORDER.length;

export function nextQuestionId(answers: Answers): string | null {
  return ORDER.find((id) => !(id in answers)) ?? null;
}

export function progress(answers: Answers): { answered: number; total: number } {
  return {
    answered: ORDER.filter((id) => id in answers).length,
    total: RUN_LENGTH,
  };
}

export function isComplete(answers: Answers): boolean {
  return nextQuestionId(answers) === null;
}
