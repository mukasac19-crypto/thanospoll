import Link from "next/link";
import { getHomeStats } from "@/lib/actions";
import { GauntletHero } from "@/components/GauntletHero";

/**
 * Regenerated at most once a minute. The live counts make the page feel
 * inhabited, but they do not need to be to-the-second accurate, and a landing
 * page should not hit the database on every request.
 */
export const revalidate = 60;

export default async function Home() {
  const { finished, rightPct, flinchPct } = await getHomeStats();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
      <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <GauntletHero className="mx-auto w-full max-w-[200px] sm:max-w-[260px] lg:order-last lg:max-w-[380px]" />

        <div className="rise space-y-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-power">
            Ten questions · Two minutes
          </p>

          <h1 className="font-display text-[clamp(3.2rem,13vw,6rem)] leading-[0.88] text-bone">
            Was Thanos
            <br />
            <span className="text-power">right?</span>
          </h1>

          <p className="max-w-md text-xl leading-snug text-balance text-ash">
            Everyone has an answer. Almost nobody keeps it for ten questions.
          </p>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <Link
              href="/play"
              className="choice aura flex-1 rounded-xl border border-power/50 bg-power/15 py-4 text-center text-[15px] font-medium text-bone hover:bg-power/25"
            >
              Answer honestly
            </Link>
            <Link
              href="/results"
              className="choice rounded-xl border border-edge bg-slab/60 px-7 py-4 text-center text-[15px] font-medium text-ash hover:border-ash/50 hover:text-bone"
            >
              See the room
            </Link>
          </div>
        </div>
      </div>

      <Stats finished={finished} rightPct={rightPct} flinchPct={flinchPct} />

      <ul className="rise mt-10 grid gap-3 sm:grid-cols-3">
        <Fact emoji="🧾" text="Contradict yourself and we keep the receipts." />
        <Fact emoji="😂" text="Three of the ten aren't serious at all." />
        <Fact emoji="💀" text="One question changes almost everybody's mind." />
      </ul>

      <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ash/50">
        Free · No ads · No right answers
      </p>
    </main>
  );
}

/**
 * Percentages only exist once enough people have answered, so early on there is
 * a single number. One lonely figure in a three-column panel reads as broken
 * layout, so below two stats this collapses to a quiet line instead — which is
 * exactly the state the site launches in.
 */
function Stats({
  finished,
  rightPct,
  flinchPct,
}: {
  finished: number;
  rightPct: number | null;
  flinchPct: number | null;
}) {
  if (finished === 0) return null;

  const stats = [
    ...(rightPct !== null
      ? [{ value: `${rightPct}%`, label: "said he was right", tone: "mind" as const }]
      : []),
    ...(flinchPct !== null
      ? [
          {
            value: `${flinchPct}%`,
            label: "backed out when it might be them",
            tone: "reality" as const,
          },
        ]
      : []),
  ];

  if (stats.length === 0) {
    return (
      <p className="stat-in mt-12 text-center text-[15px] text-ash">
        <span className="font-display text-2xl text-bone tabular-nums">
          {finished.toLocaleString()}
        </span>{" "}
        {finished === 1 ? "person has" : "people have"} answered so far.
      </p>
    );
  }

  return (
    <div
      className={`stat-in mt-14 grid gap-px overflow-hidden rounded-2xl border border-edge bg-edge/60 ${
        stats.length === 1 ? "sm:grid-cols-2" : "sm:grid-cols-3"
      }`}
    >
      <Stat value={finished.toLocaleString()} label="have answered" />
      {stats.map((s) => (
        <Stat key={s.label} value={s.value} label={s.label} tone={s.tone} />
      ))}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "mind" | "reality";
}) {
  const color =
    tone === "mind"
      ? "text-mind"
      : tone === "reality"
        ? "text-reality"
        : "text-bone";

  return (
    <div className="bg-abyss/80 px-5 py-6 text-center">
      <p className={`font-display text-4xl leading-none tabular-nums ${color}`}>
        {value}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-ash">{label}</p>
    </div>
  );
}

function Fact({ emoji, text }: { emoji: string; text: string }) {
  return (
    <li className="card flex items-start gap-3 rounded-2xl p-4">
      <span className="text-lg leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="text-[14px] leading-snug text-ash">{text}</span>
    </li>
  );
}
