import Link from "next/link";
import { getCrowd, getPairs } from "@/lib/actions";
import { FEATURED_PAIRS } from "@/lib/pairs";
import { QUESTIONS } from "@/lib/questions";
import { ALL_ARCHETYPES } from "@/lib/scoring";
import { CrowdBar } from "@/components/CrowdBar";
import { crossCell, crossRowTotal, crossTotal, tallyTotal } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const [crowd, pairs] = await Promise.all([getCrowd(), getPairs()]);

  const answered = QUESTIONS.filter((q) => tallyTotal(crowd.tallies[q.id]) > 0);

  const archetypeTotal = Object.values(crowd.archetypes).reduce(
    (s, n) => s + n,
    0,
  );
  const archetypeRows = ALL_ARCHETYPES.map((a) => ({
    ...a,
    n: crowd.archetypes[a.id] ?? 0,
  })).sort((a, b) => b.n - a.n);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14">
      <div className="rise space-y-14">
        <header className="space-y-4">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.28em] text-ash hover:text-bone"
          >
            ← Was Thanos right?
          </Link>
          <h1 className="font-display text-5xl leading-none text-bone sm:text-6xl">
            The room
          </h1>
          <p className="text-[15px] leading-relaxed text-ash">
            {crowd.completed === 0
              ? "Nobody has finished yet. The numbers below fill in as people do."
              : `${crowd.completed} ${crowd.completed === 1 ? "person has" : "people have"} finished. The interesting numbers are never the splits — they're the gaps.`}
          </p>
        </header>

        <section className="space-y-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-power">
            The gaps
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURED_PAIRS.map((pair) => {
              const table = pairs[pair.id] ?? {};
              const hits = crossCell(table, pair.choiceA, pair.choiceB);
              const base =
                pair.base === "all"
                  ? crossTotal(table)
                  : crossRowTotal(table, pair.choiceA);
              const pct = base ? Math.round((hits / base) * 100) : 0;

              return (
                <article key={pair.id} className="card rounded-2xl p-6">
                  <h3 className="font-display text-lg text-bone">{pair.title}</h3>
                  {base === 0 ? (
                    <p className="mt-3 text-[14px] text-ash/60">
                      Not enough data yet.
                    </p>
                  ) : (
                    <>
                      <p className="mt-2 font-display text-5xl tabular-nums text-mind">
                        {pct}%
                      </p>
                      <p className="mt-2 text-[14px] leading-relaxed text-ash">
                        {pair.reading}
                      </p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ash/60">
                        n={base}
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {archetypeTotal > 0 && (
          <section className="space-y-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-power">
              Where people land
            </h2>
            <ul className="space-y-3">
              {archetypeRows.map((a) => {
                const pct = Math.round((a.n / archetypeTotal) * 100);
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-lg" aria-hidden>
                      {a.emoji}
                    </span>
                    <span className="w-36 shrink-0 text-[14px] text-ash">
                      {a.title}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-edge/60">
                      <span
                        className="bar-fill block h-full rounded-full bg-power"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-12 text-right font-mono text-xs tabular-nums text-ash">
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-power">
            Every question
          </h2>

          {answered.length === 0 ? (
            <p className="text-[15px] text-ash">
              Nothing recorded yet.{" "}
              <Link href="/play" className="text-power underline">
                Be the first.
              </Link>
            </p>
          ) : (
            <ul className="space-y-8">
              {answered.map((q) => (
                <li key={q.id} className="space-y-3">
                  <div className="flex items-baseline gap-3">
                    <p className="flex-1 text-[15px] leading-snug text-bone">
                      {q.text}
                    </p>
                    {!q.scored && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-mind/70">
                        For fun
                      </span>
                    )}
                  </div>
                  <CrowdBar choices={q.choices} tally={crowd.tallies[q.id]} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          href="/play"
          className="choice aura block rounded-xl border border-power/50 bg-power/15 py-4 text-center text-[15px] font-medium text-bone hover:bg-power/25"
        >
          Take it yourself
        </Link>
      </div>
    </main>
  );
}
