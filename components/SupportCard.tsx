"use client";

import { STONES } from "@/lib/stones";
import { rememberSupported, type SupportOptions } from "@/lib/support";

/**
 * The support ask, between the last answer and the result.
 *
 * This is the highest-friction spot in the whole app — someone has answered ten
 * questions and is waiting for the thing they earned. So it is an interstitial,
 * never a gate: the result is one obvious tap away, "no paywall" is stated
 * outright, and the continue button is a full-width control rather than a grey
 * link hidden under the ask. Anything else would be a dark pattern dressed up
 * as a campaign.
 */
export function SupportCard({
  options,
  onSupport,
  onContinue,
}: {
  options: SupportOptions;
  /** Fired as the link opens, so the click is recorded before navigation. */
  onSupport: (amount: number | null) => void;
  onContinue: () => void;
}) {
  const { tiers, customUrl, fallbackUrl, currency } = options;

  const take = (amount: number | null) => {
    rememberSupported();
    onSupport(amount);
    // The link opens in its own tab; this screen moves on to the result so the
    // reward is never actually withheld.
    onContinue();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 py-12">
      <div className="rise space-y-5 text-center">
        {/* All six lit: they have answered everything. */}
        <div className="flex justify-center gap-2" aria-hidden>
          {STONES.map((stone) => (
            <span
              key={stone.id}
              className="ignite block h-2.5 w-2.5 rounded-full"
              style={{
                color: stone.color,
                background: stone.color,
                boxShadow: `0 0 10px ${stone.color}`,
              }}
            />
          ))}
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-power">
          That&apos;s all ten
        </p>

        <h1 className="font-display text-4xl leading-tight text-balance text-bone sm:text-5xl">
          Your result is ready.
        </h1>
      </div>

      <div className="card aura rise rounded-2xl p-6 sm:p-7">
        <p className="text-[15px] leading-relaxed text-ash">
          This poll is free and has no ads. If you want to see it reach more
          people — and see more questions added as the answers come in — you can
          chip in once. No subscription.
        </p>

        {tiers.length > 0 && (
          <div
            className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5"
            role="group"
            aria-label="Choose an amount"
          >
            {tiers.map((tier) => (
              <a
                key={tier.amount}
                href={tier.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => take(tier.amount)}
                className="choice rounded-xl border border-mind/40 bg-mind/10 py-3 text-center text-[15px] font-medium text-bone tabular-nums hover:border-mind hover:bg-mind/20"
              >
                {currency}
                {tier.amount}
              </a>
            ))}
          </div>
        )}

        {/* Secondary next to a row of fixed amounts, but the primary call to
            action when it is the only way to pay — a lone grey "another amount"
            link would bury the single thing on the card that matters. */}
        {customUrl && (
          <a
            href={customUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => take(null)}
            className={
              tiers.length > 0
                ? "choice mt-2 block rounded-xl border border-edge bg-slab/50 py-3 text-center text-[14px] font-medium text-ash hover:border-ash/50 hover:text-bone"
                : "choice aura mt-6 block rounded-xl border border-mind/50 bg-mind/15 py-4 text-center text-[15px] font-medium text-bone hover:bg-mind/25"
            }
          >
            {tiers.length > 0 ? "Another amount" : "Choose an amount"}
          </a>
        )}

        {tiers.length === 0 && !customUrl && fallbackUrl && (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => take(null)}
            className="choice aura mt-6 block rounded-xl border border-mind/50 bg-mind/15 py-4 text-center text-[15px] font-medium text-bone hover:bg-mind/25"
          >
            Chip in on Patreon
          </a>
        )}

        <button
          onClick={onContinue}
          className="choice mt-3 w-full rounded-xl border border-power/50 bg-power/15 py-4 text-[15px] font-medium text-bone hover:bg-power/25"
        >
          See my result
        </button>

        <p className="mt-4 text-center text-[13px] text-ash/70">
          No paywall. Your result is right there either way.
        </p>
      </div>
    </div>
  );
}
