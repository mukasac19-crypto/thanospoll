"use client";

import type { Choice } from "@/lib/questions";
import { tallyTotal, type Tally } from "@/lib/db/types";

/**
 * One row per choice, so two options and four options render the same way.
 * The old two-sided bar looked better for binary items but needed a second
 * component the moment a question had three answers.
 */
export function CrowdBar({
  choices,
  tally,
  mine,
}: {
  choices: Choice[];
  tally: Tally;
  /** Highlights the player's pick. Omit on aggregate views. */
  mine?: string;
}) {
  const total = tallyTotal(tally);

  return (
    <div className="space-y-2.5">
      {choices.map((choice) => {
        const n = tally[choice.id] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const picked = mine === choice.id;

        return (
          <div key={choice.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={picked ? "text-bone" : "text-ash"}>
                {choice.emoji && <span className="mr-1.5">{choice.emoji}</span>}
                {choice.label}
                {picked && (
                  <span className="ml-2 font-mono text-[10px] tracking-[0.15em] text-power">
                    YOU
                  </span>
                )}
              </span>
              <span
                className={`font-mono text-xs tabular-nums ${picked ? "text-bone" : "text-ash/70"}`}
              >
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-edge/60">
              <div
                className="bar-fill h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: picked
                    ? "linear-gradient(90deg, var(--color-power-dim), var(--color-power))"
                    : "color-mix(in oklab, var(--color-ash) 35%, transparent)",
                }}
              />
            </div>
          </div>
        );
      })}

      <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ash/60">
        {total === 1 ? "1 answer so far" : `${total} answers so far`}
      </p>
    </div>
  );
}
