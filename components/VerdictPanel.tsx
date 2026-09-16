"use client";

import { useState } from "react";
import Link from "next/link";
import { QUESTIONS, choiceOf } from "@/lib/questions";
import type { Answers } from "@/lib/engine";
import type { Verdict } from "@/lib/scoring";
import { tallyTotal, type Tally } from "@/lib/db/types";
import { CrowdBar } from "./CrowdBar";

export function VerdictPanel({
  verdict,
  answers,
  tallies,
  onRestart,
  offline,
}: {
  verdict: Verdict;
  answers: Answers;
  /** Null until the server responds; the result renders without it. */
  tallies: Record<string, Tally> | null;
  onRestart: () => void;
  offline: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { archetype, receipts } = verdict;

  const share = async () => {
    const text = [
      `${archetype.emoji} ${archetype.title.toUpperCase()}`,
      `"${archetype.quote}"`,
      "",
      receipts.length
        ? receipts.map((r) => `• ${r.line}`).join("\n")
        : "No contradictions. Suspicious.",
      "",
      "Was Thanos Right?",
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Share sheet dismissed, or clipboard blocked. Nothing to do.
    }
  };

  const gotchas = receipts.filter((r) => r.tone === "gotcha");
  const respects = receipts.filter((r) => r.tone === "respect");
  const asked = QUESTIONS.filter((q) => q.id in answers);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <div className="rise space-y-10">
        <header className="space-y-4 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-power">
            Your result
          </p>
          <div className="text-6xl leading-none sm:text-7xl" aria-hidden>
            {archetype.emoji}
          </div>
          <h1 className="font-display text-5xl leading-none text-balance text-bone uppercase sm:text-6xl">
            {archetype.title}
          </h1>
          <p className="font-display text-xl text-mind italic">
            “{archetype.quote}”
          </p>
          <p className="mx-auto max-w-lg text-left text-[15px] leading-relaxed text-ash">
            {archetype.body}
          </p>
        </header>

        {gotchas.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-power">
              The receipts
            </h2>
            {gotchas.map((r) => (
              <article
                key={r.id}
                className="card rounded-2xl border-l-2 border-l-reality/70 p-5"
              >
                <h3 className="font-display text-lg text-bone">{r.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ash">
                  {r.line}
                </p>
              </article>
            ))}
          </section>
        )}

        {respects.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-time">
              Credit where it&apos;s due
            </h2>
            {respects.map((r) => (
              <article
                key={r.id}
                className="card rounded-2xl border-l-2 border-l-time/70 p-5"
              >
                <h3 className="font-display text-lg text-bone">{r.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ash">
                  {r.line}
                </p>
              </article>
            ))}
          </section>
        )}

        {receipts.length === 0 && (
          <section className="card rounded-2xl border-l-2 border-l-time/70 p-5">
            <h2 className="font-display text-lg text-bone">
              You didn&apos;t contradict yourself once
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ash">
              Ten questions, no receipts. Either you thought about this carefully
              or you have answered it before.
            </p>
          </section>
        )}

        {/* Held back until now on purpose: seeing the room mid-run would have
            shaped the answers, and the flinch question is the one that matters
            most to keep clean. */}
        <section className="space-y-7">
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-power">
              Now you can look
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ash/80">
              How the rest of the room answered, next to what you said.
            </p>
          </div>

          {tallies === null ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ash">
              {offline ? "Results unavailable" : "Counting the room…"}
            </p>
          ) : (
            <ul className="space-y-8">
              {asked.map((q) => {
                const choice = choiceOf(q.id, answers[q.id]);
                const tally = tallies[q.id] ?? {};
                return (
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

                    {tallyTotal(tally) > 0 ? (
                      <CrowdBar
                        choices={q.choices}
                        tally={tally}
                        mine={answers[q.id]}
                      />
                    ) : (
                      <p className="text-[14px] text-ash">
                        You said{" "}
                        <span className="text-bone">
                          {choice?.emoji} {choice?.label}
                        </span>
                        . You&apos;re the first.
                      </p>
                    )}

                    {q.aftermath && (
                      <p className="border-l-2 border-mind/50 pl-4 text-[14px] leading-relaxed text-ash">
                        {q.aftermath}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {offline && (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-reality/80">
            Your run was not recorded — the results store is unreachable.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={share}
            className="choice rounded-xl border border-power/50 bg-power/15 py-3.5 text-sm font-medium text-bone hover:bg-power/25"
          >
            {copied ? "Copied" : "Share this"}
          </button>
          <Link
            href="/results"
            className="choice rounded-xl border border-edge bg-slab/60 py-3.5 text-center text-sm font-medium text-bone hover:border-ash/50"
          >
            The whole room
          </Link>
          <button
            onClick={onRestart}
            className="choice rounded-xl border border-edge bg-slab/60 py-3.5 text-sm font-medium text-ash hover:border-ash/50 hover:text-bone"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
