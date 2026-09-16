/**
 * The question bank — ten items, linear.
 *
 * `Choice` is an option object rather than a bare "yes" | "no", so the funny
 * items can carry three or four answers without a second code path. Binary
 * items are just questions with two choices; nothing in the engine, the store,
 * or the results page treats them specially.
 *
 * Rhythm matters more than it looks: the unscored jokes sit at 3, 6 and 9, so
 * the analytical spine never runs more than two items without a laugh, and the
 * two questions that trap people (press / fifty) land back to back at 7 and 8.
 */

export interface Choice {
  id: string;
  label: string;
  emoji?: string;
}

export interface Question {
  id: string;
  text: string;
  /** Framing shown above the item. Never argues a side. */
  context?: string;
  choices: Choice[];
  /**
   * Unscored items still get recorded and still show live splits — they just do
   * not feed the archetype. They are there to be screenshotted.
   */
  scored: boolean;
  /** Revealed only after the player commits. */
  aftermath?: string;
}

export const QUESTIONS: Question[] = [
  {
    id: "right",
    text: "Was Thanos right?",
    context:
      "He believed there were too many people and not enough to go around. Before anything else — your gut.",
    scored: true,
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "No", emoji: "🔴" },
    ],
  },
  {
    id: "overpopulated",
    text: "Do you think the world has too many people?",
    scored: true,
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "No", emoji: "🔴" },
    ],
  },
  {
    id: "gauntlet_day",
    text: "Thanos hands you the Infinity Gauntlet for ONE day. What are you doing first?",
    context: "Be honest. Nobody is watching. Except everyone, later, in the results.",
    scored: false,
    choices: [
      { id: "rich", label: "Making myself rich", emoji: "💰" },
      { id: "revive", label: "Bringing someone back", emoji: "❤️" },
      { id: "fix", label: "Fixing the world", emoji: "🌍" },
      { id: "keep", label: "I'm keeping the Gauntlet", emoji: "😂" },
    ],
  },
  {
    id: "unlimited",
    text: "If Thanos could create unlimited food, water and energy, should he have done that instead?",
    context: "He had all six stones. Reality was a suggestion at that point.",
    scored: true,
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "No", emoji: "🔴" },
    ],
  },
  {
    id: "growth",
    text: "But if the population kept growing, wouldn't we eventually use all that up too?",
    scored: true,
    aftermath:
      "This is the actual argument. Everything else Thanos says is decoration on this one claim.",
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "No", emoji: "🔴" },
    ],
  },
  {
    id: "responsible",
    text: "Be honest — would you actually use the Gauntlet responsibly?",
    scored: false,
    choices: [
      { id: "course", label: "Of course", emoji: "😇" },
      { id: "absolutely_not", label: "Absolutely not", emoji: "😈" },
      { id: "depends", label: "Depends what I can get", emoji: "💰" },
      { id: "oops", label: "I'd accidentally destroy the universe", emoji: "💀" },
    ],
  },
  {
    id: "press",
    text: "Would you press the Snap button yourself?",
    context: "You know exactly what happens. Half of everything, gone, instantly.",
    scored: true,
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "Hell no", emoji: "🔴" },
    ],
  },
  {
    id: "fifty",
    text: "Okay… what if YOU had a 100% chance of disappearing? Would you still press it?",
    context: "You don't get to know which half you're in. Nobody did.",
    scored: true,
    aftermath:
      "Philosophers call this the veil of ignorance. It has been quietly demolishing confident opinions since 1971.",
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "Absolutely not", emoji: "🔴" },
    ],
  },
  {
    id: "deal",
    text: "Thanos offers you a deal: save yourself and your family, and someone else gets snapped instead. Taking it?",
    scored: false,
    choices: [
      { id: "wrong", label: "No, that's wrong", emoji: "😇" },
      { id: "obviously", label: "Obviously", emoji: "😈" },
      { id: "minute", label: "I'd need a minute", emoji: "🤔" },
      { id: "sign", label: "Where do I sign?", emoji: "💀" },
    ],
  },
  {
    id: "villain",
    text: "After everything you've just answered… was Thanos actually the villain?",
    scored: true,
    choices: [
      { id: "yes", label: "Yes", emoji: "🟢" },
      { id: "no", label: "No", emoji: "🔴" },
    ],
  },
];

export const BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q]),
);

export function question(id: string): Question {
  const q = BY_ID[id];
  if (!q) throw new Error(`Unknown question: ${id}`);
  return q;
}

export function choiceOf(qid: string, choiceId: string): Choice | undefined {
  return BY_ID[qid]?.choices.find((c) => c.id === choiceId);
}

/** Guards the server action: a choice id must belong to its question. */
export function isValidChoice(qid: string, choiceId: string): boolean {
  return Boolean(choiceOf(qid, choiceId));
}
