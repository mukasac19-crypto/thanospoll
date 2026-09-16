"use client";

import { STONES, type StoneId } from "@/lib/stones";

/**
 * Progress meter as the Gauntlet. A stone lights when a question that belongs
 * to it has been answered, so the meter fills for a reason rather than by
 * arithmetic — and it completes on the question that asks whether you'd use it.
 * The numeric counter carries plain progress, since the stones no longer do.
 */
export function Gauntlet({
  used,
  active,
  answered,
  total,
}: {
  used: Set<StoneId>;
  /** The stone belonging to the question on screen, shown dimly lit. */
  active?: StoneId | null;
  answered: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex gap-1.5"
        role="img"
        aria-label={`${used.size} of ${STONES.length} stones, ${answered} of ${total} answered`}
      >
        {STONES.map((stone) => {
          const lit = used.has(stone.id);
          const pending = !lit && active === stone.id;
          return (
            <span
              key={stone.id}
              title={stone.name}
              className={`block h-2 w-2 rounded-full transition-all duration-700 ${lit ? "ignite" : ""}`}
              style={{
                color: stone.color,
                background: lit
                  ? stone.color
                  : pending
                    ? `color-mix(in oklab, ${stone.color} 35%, var(--color-edge))`
                    : "var(--color-edge)",
                boxShadow: lit
                  ? `0 0 8px ${stone.color}`
                  : pending
                    ? `0 0 4px color-mix(in oklab, ${stone.color} 40%, transparent)`
                    : "none",
              }}
            />
          );
        })}
      </div>
      <span className="font-mono text-[11px] tracking-[0.2em] text-ash uppercase">
        {answered}/{total}
      </span>
    </div>
  );
}
