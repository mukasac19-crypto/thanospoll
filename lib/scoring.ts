import type { Answers } from "./engine";

/**
 * Results have personality, not labels. "Utilitarian" is a category; "You
 * didn't hesitate" is something a person screenshots.
 *
 * Receipts quote the player's own answers back at them. They are the shareable
 * part, so they are written short and never smug — the Hypocrite gag only lands
 * if it reads as a wink rather than a scolding.
 */

export interface Archetype {
  id: string;
  emoji: string;
  title: string;
  quote: string;
  body: string;
}

export type ReceiptTone = "gotcha" | "respect";

export interface Receipt {
  id: string;
  tone: ReceiptTone;
  title: string;
  line: string;
}

const is = (a: Answers, q: string, c: string) => a[q] === c;

/**
 * How much the unscored joke answers lean chaotic. Two points for a genuinely
 * unhinged pick, one for a hedge.
 */
const CHAOS: Record<string, Record<string, number>> = {
  gauntlet_day: { keep: 2, rich: 1, revive: 0, fix: 0 },
  responsible: { absolutely_not: 2, oops: 2, depends: 1, course: 0 },
  deal: { sign: 2, obviously: 2, minute: 1, wrong: 0 },
};

export function chaosScore(a: Answers): number {
  return Object.entries(CHAOS).reduce(
    (sum, [qid, table]) => sum + (table[a[qid]] ?? 0),
    0,
  );
}

const ARCHETYPES: Archetype[] = [
  {
    id: "thanos",
    emoji: "💀",
    title: "The Thanos",
    quote: "You didn't hesitate.",
    body: "You said he was right, you'd press it yourself, and you'd press it knowing you might be one of the ones that goes. That is a rare, terrifying kind of consistent. Most people fold at the last question. You did not.",
  },
  {
    id: "hypocrite",
    emoji: "😂",
    title: "The Hypocrite",
    quote: "Interesting…",
    body: "You said Thanos was right. You said you'd press the button yourself. Then we asked whether you'd be okay disappearing — and suddenly it was absolutely not. The maths was fine right up until it included you.",
  },
  {
    id: "chaos",
    emoji: "😈",
    title: "The Chaos Agent",
    quote: "You were never here for the moral dilemma.",
    body: "Population ethics, resource scarcity, the fate of every living thing — and you just wanted the glove. Honestly, refreshing. Genuinely concerning. Please do not be given the glove.",
  },
  {
    id: "realist",
    emoji: "🧠",
    title: "The Realist",
    quote: "Thanos had a point… just not a good solution.",
    body: "You think the problem is real. You just think the answer is to invent our way out of it rather than commit universal genocide. This is the most common result, and the most annoying to argue with.",
  },
  {
    id: "humanist",
    emoji: "❤️",
    title: "The Humanist",
    quote: "You'd rather struggle than sacrifice innocent people.",
    body: "No arithmetic moved you. Half the universe is not a rounding error, and a life does not stop counting because there are a lot of them. You'd take the harder world over the emptier one.",
  },
];

const BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeById(id: string): Archetype | undefined {
  return BY_ID[id];
}

export const ALL_ARCHETYPES = ARCHETYPES;

/**
 * First match wins, so the order is the design. The Hypocrite is tested before
 * The Thanos because they share two answers and differ only on the last one —
 * and the funnier read is the true one.
 */
function resolveArchetype(a: Answers): Archetype {
  const chaos = chaosScore(a);

  if (is(a, "right", "yes") && is(a, "press", "yes") && is(a, "fifty", "no")) {
    return BY_ID.hypocrite;
  }
  if (is(a, "right", "yes") && is(a, "press", "yes") && is(a, "fifty", "yes")) {
    return BY_ID.thanos;
  }
  if (chaos >= 4) return BY_ID.chaos;
  if (
    (is(a, "overpopulated", "yes") || is(a, "growth", "yes")) &&
    is(a, "press", "no")
  ) {
    return BY_ID.realist;
  }
  return BY_ID.humanist;
}

interface ReceiptDef extends Receipt {
  triggered: (a: Answers) => boolean;
}

const RECEIPTS: ReceiptDef[] = [
  {
    id: "veil",
    tone: "gotcha",
    title: "The 50% problem",
    line: "You'd press it — right up until you might be in the half that disappears.",
    triggered: (a) => is(a, "press", "yes") && is(a, "fifty", "no"),
  },
  {
    id: "alternative",
    tone: "gotcha",
    title: "You closed your own escape hatch",
    line: "You said he should have made unlimited resources instead — then agreed we'd burn through those too. So that wasn't a solution either.",
    triggered: (a) => is(a, "unlimited", "yes") && is(a, "growth", "yes"),
  },
  {
    id: "verdict",
    tone: "gotcha",
    title: "Right and villainous",
    line: "You said he was right, and you still called him the villain. Both can be true — most people just don't say it out loud.",
    triggered: (a) => is(a, "right", "yes") && is(a, "villain", "yes"),
  },
  {
    id: "acquitted",
    tone: "gotcha",
    title: "Wrong, but not the villain",
    line: "You said he was wrong and then declined to call him the villain. Someone has been reading his side of it.",
    triggered: (a) => is(a, "right", "no") && is(a, "villain", "no"),
  },
  {
    id: "deal",
    tone: "gotcha",
    title: "Not by your hand, though",
    line: "You wouldn't press the button — but you'd take the deal that snaps a stranger to save your family. Same outcome, cleaner conscience.",
    triggered: (a) =>
      is(a, "press", "no") && (is(a, "deal", "obviously") || is(a, "deal", "sign")),
  },
  {
    id: "saint",
    tone: "respect",
    title: "You didn't take the deal",
    line: "You'd risk yourself before you'd trade away a stranger. That combination is rarer than it should be.",
    triggered: (a) => is(a, "deal", "wrong") && is(a, "fifty", "yes"),
  },
  {
    id: "steady",
    tone: "respect",
    title: "Same answer, start to finish",
    line: "You said he was wrong at the first question and you were still saying it at the last. Nothing we threw at you moved it.",
    triggered: (a) =>
      is(a, "right", "no") && is(a, "press", "no") && is(a, "villain", "yes"),
  },
];

export interface Verdict {
  archetype: Archetype;
  receipts: Receipt[];
  chaos: number;
}

export function scoreRun(answers: Answers): Verdict {
  const strip = ({ id, tone, title, line }: ReceiptDef): Receipt => ({
    id,
    tone,
    title,
    line,
  });

  return {
    archetype: resolveArchetype(answers),
    receipts: RECEIPTS.filter((r) => r.triggered(answers)).map(strip),
    chaos: chaosScore(answers),
  };
}
