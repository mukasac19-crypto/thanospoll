/**
 * Which stone belongs to which question.
 *
 * This is one system, not decoration: the card glows in its question's stone,
 * answering fires that stone's effect, and that stone ignites in the Gauntlet.
 *
 * The mapping is built so a new stone appears roughly every question and the
 * sixth lands on "would you press the Snap button yourself" — the Gauntlet
 * completes exactly as it is asked to be used. The question after it, the one
 * where it might be you, fires all six at once.
 */

export type StoneId = "space" | "mind" | "reality" | "power" | "time" | "soul";

/** "gauntlet" is all six at once, reserved for the run's climax. */
export type EffectId = StoneId | "gauntlet";

export interface Stone {
  id: StoneId;
  name: string;
  /** CSS colour, for glows and the meter. */
  color: string;
  /** Same colour as canvas needs it, to avoid parsing per particle. */
  rgb: [number, number, number];
}

/** Canonical order, used by the Gauntlet meter. */
export const STONES: Stone[] = [
  { id: "space", name: "Space", color: "#60a5fa", rgb: [96, 165, 250] },
  { id: "mind", name: "Mind", color: "#fbbf24", rgb: [251, 191, 36] },
  { id: "reality", name: "Reality", color: "#f43f5e", rgb: [244, 63, 94] },
  { id: "power", name: "Power", color: "#8b5cf6", rgb: [139, 92, 246] },
  { id: "time", name: "Time", color: "#4ade80", rgb: [74, 222, 128] },
  { id: "soul", name: "Soul", color: "#f97362", rgb: [249, 115, 98] },
];

export const STONE_BY_ID: Record<StoneId, Stone> = Object.fromEntries(
  STONES.map((s) => [s.id, s]),
) as Record<StoneId, Stone>;

const QUESTION_EFFECT: Record<string, EffectId> = {
  // An opinion, before any evidence. Mind.
  right: "mind",
  // Is the premise actually true? Reality.
  overpopulated: "reality",
  // Raw power fantasy. Power.
  gauntlet_day: "power",
  // Conjuring matter across the universe. Space.
  unlimited: "space",
  // The future, and regrowth. Time.
  growth: "time",
  // What you'd really do with it. Power again.
  responsible: "power",
  // The sacrifice — and the sixth stone, so the Gauntlet completes here.
  press: "soul",
  // The flinch. Everything fires.
  fifty: "gauntlet",
  // Bargaining with what is. Reality.
  deal: "reality",
  // Final judgement, bookending the first question. Mind.
  villain: "mind",
};

export function effectFor(qid: string): EffectId {
  return QUESTION_EFFECT[qid] ?? "power";
}

/** Gold for the all-six effect; otherwise the stone's own colour. */
export function effectColor(effect: EffectId): string {
  return effect === "gauntlet" ? "#fde68a" : STONE_BY_ID[effect].color;
}

/** Stones lit in the Gauntlet, given the questions answered so far. */
export function stonesUsed(answeredQids: string[]): Set<StoneId> {
  const used = new Set<StoneId>();
  for (const qid of answeredQids) {
    const effect = QUESTION_EFFECT[qid];
    if (!effect) continue;
    if (effect === "gauntlet") STONES.forEach((s) => used.add(s.id));
    else used.add(effect);
  }
  return used;
}
