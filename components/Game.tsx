"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { nanoid } from "nanoid";
import { question, type Choice } from "@/lib/questions";
import { nextQuestionId, progress, type Answers } from "@/lib/engine";
import { scoreRun, type Verdict } from "@/lib/scoring";
import { finishRun, recordSupport, submitAnswer } from "@/lib/actions";
import type { Tally } from "@/lib/db/types";
import { effectColor, effectFor, stonesUsed } from "@/lib/stones";
import { useStoneEffect } from "./EffectProvider";
import { Gauntlet } from "./Gauntlet";
import {
  hasSupportOptions,
  shouldAskForSupport,
  supportOptions,
} from "@/lib/support";
import { SupportCard } from "./SupportCard";
import { VerdictPanel } from "./VerdictPanel";

const STORAGE_KEY = "thanos.run.v2";
const DUST_MS = 620;

type Phase = "intro" | "asking" | "support" | "verdict";

interface Saved {
  id: string;
  answers: Answers;
}

function load(): Saved {
  if (typeof window === "undefined") return { id: "", answers: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Saved;
      if (parsed?.id && parsed.answers) return parsed;
    }
  } catch {
    // Corrupt or unavailable storage just means a fresh run.
  }
  return { id: nanoid(16), answers: {} };
}

export function Game() {
  const fire = useStoneEffect();
  const cardRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<Saved>({ id: "", answers: {} });
  const [phase, setPhase] = useState<Phase>("intro");
  const [dusting, setDusting] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tallies, setTallies] = useState<Record<string, Tally> | null>(null);
  const [offline, setOffline] = useState(false);

  /**
   * Ends the run. The verdict is scored locally first so the result appears
   * instantly, then the server copy replaces it along with the tallies for the
   * comparison — which is the only place the crowd is shown, so that seeing how
   * others voted cannot influence any answer.
   *
   * finishRun is fired here rather than after the support step, so the tallies
   * are already in hand by the time the result is shown. The ask costs the
   * player a tap, never a spinner.
   */
  const finish = useCallback((id: string, answers: Answers) => {
    setVerdict(scoreRun(answers));
    setPhase(
      shouldAskForSupport({ configured: hasSupportOptions(supportOptions()) })
        ? "support"
        : "verdict",
    );
    finishRun(id, answers)
      .then((res) => {
        setVerdict(res.verdict);
        setTallies(res.tallies);
      })
      .catch(() => setOffline(true));
  }, []);

  /*
   * Restore on mount only. This cannot move into a useState initialiser: that
   * runs during the server render too, where localStorage does not exist, so
   * the server would emit the intro while the client resumed mid-run and
   * hydration would mismatch. Reading after mount is the correct trade.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = load();
    setSession(saved);
    if (Object.keys(saved.answers).length === 0) return;

    const next = nextQuestionId(saved.answers);
    if (next) {
      setCurrent(next);
      setPhase("asking");
    } else {
      // Answered everything, then reloaded before seeing the result.
      finish(saved.id, saved.answers);
    }
  }, [finish]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!session.id) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode: the run works, it just will not survive a reload.
    }
  }, [session]);

  const begin = useCallback(() => {
    setCurrent(nextQuestionId(session.answers));
    setPhase("asking");
  }, [session.answers]);

  const choose = useCallback(
    (choiceId: string) => {
      if (!current || dusting) return;
      const answers: Answers = { ...session.answers, [current]: choiceId };
      const position = Object.keys(answers).length;

      setDusting(true);
      fire(cardRef.current, effectFor(current));

      // Fire and forget — nothing on screen waits for the network.
      submitAnswer(session.id, current, choiceId, position).catch(() =>
        setOffline(true),
      );

      // One tap per question: the card dusts and the next one is already there.
      window.setTimeout(() => {
        setSession((s) => ({ ...s, answers }));
        setDusting(false);
        const next = nextQuestionId(answers);
        if (next) setCurrent(next);
        else finish(session.id, answers);
      }, DUST_MS);
    },
    [current, dusting, session.answers, session.id, fire, finish],
  );

  const restart = useCallback(() => {
    const fresh: Saved = { id: nanoid(16), answers: {} };
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setSession(fresh);
    setCurrent(null);
    setVerdict(null);
    setTallies(null);
    setPhase("intro");
  }, []);

  // Number keys pick an answer. Works for two options or four.
  useEffect(() => {
    if (phase !== "asking" || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const choices = question(current).choices;
      if (n >= 1 && n <= choices.length) choose(choices[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, current, choose]);

  const { answered, total } = progress(session.answers);
  const used = stonesUsed(Object.keys(session.answers));

  if (phase === "intro") return <Intro onBegin={begin} />;

  const support = phase === "support" ? supportOptions() : null;

  if (phase === "support" && support && hasSupportOptions(support)) {
    return (
      <SupportCard
        options={support}
        onSupport={(amount) => void recordSupport(session.id, amount)}
        onContinue={() => setPhase("verdict")}
      />
    );
  }

  // Falls through to the result if the link vanished between the check and the
  // render, so a missing env var can never strand someone on the last question.
  if ((phase === "verdict" || phase === "support") && verdict) {
    return (
      <VerdictPanel
        verdict={verdict}
        answers={session.answers}
        tallies={tallies}
        onRestart={restart}
        offline={offline}
      />
    );
  }

  if (!current) return null;
  const q = question(current);
  const effect = effectFor(current);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 py-10">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-ash">
          {q.scored ? `Question ${answered + 1}` : "Just for fun"}
        </span>
        <Gauntlet
          used={used}
          active={effect === "gauntlet" ? null : effect}
          answered={answered}
          total={total}
        />
      </header>

      <div
        ref={cardRef}
        key={current}
        // The card wears its question's stone, so the colour that sweeps the
        // edge is the colour it is about to come apart in.
        style={{ "--stone": effectColor(effect) } as CSSProperties}
        className={`card aura rounded-2xl p-7 sm:p-9 ${dusting ? "dusting" : "rise"}`}
      >
        {q.context && (
          <p className="mb-5 font-display text-[15px] leading-relaxed text-ash italic sm:text-base">
            {q.context}
          </p>
        )}
        <h1 className="font-display text-[26px] leading-[1.2] text-balance text-bone sm:text-[32px]">
          {q.text}
        </h1>

        <div
          className={`mt-8 grid gap-3 ${q.choices.length === 2 ? "sm:grid-cols-2" : ""}`}
        >
          {q.choices.map((choice, i) => (
            <ChoiceButton
              key={choice.id}
              choice={choice}
              hint={String(i + 1)}
              accent={q.choices.length === 2 && i === 0}
              onClick={() => choose(choice.id)}
              disabled={dusting}
            />
          ))}
        </div>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ash/50">
        You&apos;ll see how everyone else answered at the end
      </p>
    </div>
  );
}

function ChoiceButton({
  choice,
  hint,
  accent,
  onClick,
  disabled,
}: {
  choice: Choice;
  hint: string;
  accent: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`choice group flex items-center gap-3 rounded-xl border px-5 py-4 text-left disabled:opacity-40 ${
        accent
          ? "border-power/35 bg-power/10 hover:border-power hover:bg-power/20"
          : "border-edge bg-slab/50 hover:border-ash/50 hover:bg-slab"
      }`}
    >
      {choice.emoji && (
        <span className="text-xl leading-none" aria-hidden>
          {choice.emoji}
        </span>
      )}
      <span className="flex-1 text-[15px] font-medium text-bone">
        {choice.label}
      </span>
      <span className="font-mono text-[10px] tracking-[0.15em] text-ash/50">
        {hint}
      </span>
    </button>
  );
}

function Intro({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 py-12">
      <div className="rise space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-power">
          Ten questions
        </p>
        <h1 className="font-display text-4xl leading-tight text-balance text-bone sm:text-5xl">
          There are no right answers. There are only consistent ones.
        </h1>
        <div className="space-y-4 text-[15px] leading-relaxed text-ash">
          <p>
            Some of these are serious. Some of them are absolutely not. It takes
            about a minute.
          </p>
          <p>
            You won&apos;t see how anyone else voted until the end — knowing
            would change your answers, and the whole point is what you&apos;d
            say on your own. Then you get a result, and if you contradicted yourself along
            the way, we kept the receipts.
          </p>
        </div>
      </div>

      <button
        onClick={onBegin}
        className="choice aura w-full rounded-xl border border-power/50 bg-power/15 py-4 text-[15px] font-medium text-bone hover:bg-power/25"
      >
        Begin
      </button>
    </div>
  );
}
