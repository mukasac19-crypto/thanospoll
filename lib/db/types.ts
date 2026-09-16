/**
 * Storage types.
 *
 * A recorded answer is a choice id string, not a yes/no. Binary questions store
 * "yes"/"no" because those happen to be their choice ids — the store has no
 * concept of a binary question at all, which is what lets a four-option joke
 * item share every query, index and aggregate with the analytical ones.
 */

/** choiceId -> count, for one question. */
export type Tally = Record<string, number>;

/** "choiceA choiceB" -> count, for a pair of questions. */
export type CrossTab = Record<string, number>;

export interface SessionMeta {
  archetype: string;
  chaos: number;
  /** Null when the visitor declined analytics, or has not been asked yet. */
  visitorId: string | null;
}

/**
 * A recorded visit. Note what is absent: no IP, no raw user agent, no
 * fingerprint. `visitorId` is a random opaque value minted server-side, so it
 * identifies a browser that opted in and nothing more.
 */
export interface VisitInput {
  visitorId: string;
  path: string;
  /** Origin only — a full URL can carry search terms in its query string. */
  referrer: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
}

/**
 * Clicks against finished runs. Deliberately not tracking "was shown" as a
 * separate state: it needs an extra write on every completion and a second RPC,
 * to sharpen a number whose only job is to answer "is the ask working".
 */
export interface SupportRate {
  supported: number;
  completed: number;
}

export interface VisitorStats {
  visitors: number;
  visits: number;
  returning: number;
  completed: number;
}

export interface Store {
  recordAnswer(
    sessionId: string,
    qid: string,
    choiceId: string,
    position: number,
  ): Promise<void>;
  completeSession(sessionId: string, meta: SessionMeta): Promise<void>;
  tallies(): Promise<Record<string, Tally>>;
  archetypes(): Promise<Record<string, number>>;
  completedCount(): Promise<number>;
  /** Joint distribution of two items across sessions that answered both. */
  crossTab(a: string, b: string): Promise<CrossTab>;
  recordVisit(visit: VisitInput): Promise<void>;
  /**
   * Marks that this run's player followed a support link. `amount` is null
   * for a custom or single-link ask. A click is not a purchase — it is the
   * last thing measurable from here, and it is what decides which price
   * points are worth keeping.
   */
  markSupported(sessionId: string, amount: number | null): Promise<void>;
  supportRate(): Promise<SupportRate>;
  visitorStats(): Promise<VisitorStats>;
}

export const EMPTY_VISITOR_STATS: VisitorStats = {
  visitors: 0,
  visits: 0,
  returning: 0,
  completed: 0,
};

const SEP = " ";

export function crossKey(a: string, b: string): string {
  return `${a}${SEP}${b}`;
}

export function crossCell(table: CrossTab, a: string, b: string): number {
  return table[crossKey(a, b)] ?? 0;
}

export function crossTotal(table: CrossTab): number {
  return Object.values(table).reduce((s, n) => s + n, 0);
}

/** Everyone who gave `a` as their answer to the first question. */
export function crossRowTotal(table: CrossTab, a: string): number {
  return Object.entries(table).reduce(
    (sum, [key, n]) => (key.split(SEP)[0] === a ? sum + n : sum),
    0,
  );
}

export function foldCross(
  rows: { ca: string; cb: string; n: number }[],
): CrossTab {
  const out: CrossTab = {};
  for (const r of rows) out[crossKey(r.ca, r.cb)] = Number(r.n);
  return out;
}

export function rowsToTallies(
  rows: { qid: string; choice: string; n: number }[],
): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const r of rows) {
    out[r.qid] ??= {};
    out[r.qid][r.choice] = Number(r.n);
  }
  return out;
}

export function tallyTotal(tally: Tally | undefined): number {
  return tally ? Object.values(tally).reduce((s, n) => s + n, 0) : 0;
}
