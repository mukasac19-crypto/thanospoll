"use server";

import { getStore, type CrossTab, type Tally } from "./db";
import { crossCell, crossRowTotal, tallyTotal } from "./db/types";
import { scoreRun, type Verdict } from "./scoring";
import type { Answers } from "./engine";
import { isValidChoice } from "./questions";
import { FEATURED_PAIRS } from "./pairs";
import { currentVisitorId } from "./analytics";

const SESSION_RE = /^[A-Za-z0-9_-]{8,32}$/;

function assertSession(id: string) {
  if (!SESSION_RE.test(id)) throw new Error("Bad session id");
}

/**
 * Written per answer rather than batched at the end, so someone who abandons
 * halfway still counts. Dropout is data.
 *
 * Returns nothing on purpose. This used to hand back the question's live tally
 * so the UI could show a split straight after answering — which meant a full
 * aggregate over the answers table on every keystroke, and, worse, told players
 * how the room had voted before they reached the items designed to catch them
 * out. The comparison now happens once, at the end.
 */
export async function submitAnswer(
  sessionId: string,
  qid: string,
  choiceId: string,
  position: number,
): Promise<void> {
  assertSession(sessionId);
  // A choice id is only meaningful next to its question — "keep" is legal for
  // the Gauntlet item and nonsense for the Snap button.
  if (!isValidChoice(qid, choiceId)) {
    throw new Error(`Invalid choice "${choiceId}" for question "${qid}"`);
  }

  const store = await getStore();
  await store.recordAnswer(sessionId, qid, choiceId, position);
}

/**
 * Records the finished run and hands back everything the result screen needs in
 * one round trip: the verdict, and the tallies for the end-of-run comparison.
 */
export async function finishRun(
  sessionId: string,
  answers: Answers,
): Promise<{ verdict: Verdict; tallies: Record<string, Tally> }> {
  assertSession(sessionId);
  const verdict = scoreRun(answers);
  const store = await getStore();
  await store.completeSession(sessionId, {
    archetype: verdict.archetype.id,
    chaos: verdict.chaos,
    // Null unless they opted in, which is what makes the visited to started to
    // finished funnel measurable without identifying anybody.
    visitorId: await currentVisitorId(),
  });
  return { verdict, tallies: await store.tallies() };
}

/**
 * Records that this run's player followed the support link. Never throws into
 * the UI: failing to count a click must not interrupt someone on their way to
 * Patreon.
 */
export async function recordSupport(
  sessionId: string,
  amount: number | null = null,
): Promise<void> {
  assertSession(sessionId);
  // Bounded and finite: this arrives from the client, and an absurd value
  // would only ever corrupt the very report it exists to feed.
  const clean =
    amount !== null && Number.isFinite(amount) && amount > 0 && amount <= 100000
      ? Math.round(amount * 100) / 100
      : null;
  try {
    const store = await getStore();
    await store.markSupported(sessionId, clean);
  } catch (error) {
    console.warn("[support] click not recorded:", error);
  }
}

export async function getCrowd(): Promise<{
  tallies: Record<string, Tally>;
  archetypes: Record<string, number>;
  completed: number;
}> {
  const store = await getStore();
  const [tallies, archetypes, completed] = await Promise.all([
    store.tallies(),
    store.archetypes(),
    store.completedCount(),
  ]);
  return { tallies, archetypes, completed };
}

/**
 * The three numbers the landing page shows.
 *
 * Percentages are withheld below MIN_SAMPLE. "100% said yes" off two answers is
 * not a striking statistic, it is a false one, and the home page is the worst
 * place to print a number that will swing wildly tomorrow.
 */
const MIN_SAMPLE = 8;

export async function getHomeStats(): Promise<{
  finished: number;
  rightPct: number | null;
  flinchPct: number | null;
}> {
  let finished = 0;
  let tallies: Record<string, Tally> = {};
  let flinch: CrossTab = {};

  try {
    const store = await getStore();
    [finished, tallies, flinch] = await Promise.all([
      store.completedCount(),
      store.tallies(),
      store.crossTab("press", "fifty"),
    ]);
  } catch (error) {
    // The landing page is the front door. A database hiccup should cost the
    // stat strip, never the whole page — returning zeros hides it and the hero
    // renders exactly as it would before anyone had answered.
    console.warn("[home] stats unavailable:", error);
    return { finished: 0, rightPct: null, flinchPct: null };
  }

  const right = tallies.right ?? {};
  const rightTotal = tallyTotal(right);
  const rightPct =
    rightTotal >= MIN_SAMPLE
      ? Math.round(((right.yes ?? 0) / rightTotal) * 100)
      : null;

  // Of those who said they would press it, how many backed out at 50/50.
  const wouldPress = crossRowTotal(flinch, "yes");
  const flinchPct =
    wouldPress >= MIN_SAMPLE
      ? Math.round((crossCell(flinch, "yes", "no") / wouldPress) * 100)
      : null;

  return { finished, rightPct, flinchPct };
}

export async function getPairs(): Promise<Record<string, CrossTab>> {
  const store = await getStore();
  const results = await Promise.all(
    FEATURED_PAIRS.map(async (p) => [p.id, await store.crossTab(p.a, p.b)] as const),
  );
  return Object.fromEntries(results);
}
