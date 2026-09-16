"use client";

import { useEffect, useState } from "react";
import { setConsent, trackVisit } from "@/lib/analytics";
import { CONSENT_COOKIE, parseConsent, type Consent } from "@/lib/visitor";

/**
 * Reads the consent cookie on the client rather than having the layout read it
 * server-side, which would make every route dynamic and cost the landing page
 * its static generation. The consent cookie is deliberately not httpOnly for
 * exactly this reason; the visitor id, which nothing on the client needs, is.
 */
function readConsent(): Consent {
  if (typeof document === "undefined") return "unset";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.split("=")[1]);
}

export function ConsentBanner() {
  const [consent, setLocal] = useState<Consent | null>(null);
  const [details, setDetails] = useState(false);

  /*
   * Read after mount, not during render. document.cookie does not exist on the
   * server, so doing this in a useState initialiser would render "no banner" on
   * the server and "banner" on the client, and hydration would mismatch.
   */
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => setLocal(readConsent()), []);

  const decide = async (granted: boolean) => {
    setLocal(granted ? "granted" : "denied");
    await setConsent(granted);
    // Grant applies to the page they are already on, not just the next one.
    if (granted) await trackVisit(window.location.pathname);
  };

  // null means "not read yet" — render nothing rather than flashing a banner
  // at someone who already answered.
  if (consent === null || consent !== "unset") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-5">
      <div className="card rise mx-auto max-w-2xl rounded-2xl p-5 shadow-2xl">
        <p className="text-[14px] leading-relaxed text-bone">
          Can we count your visit?
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ash">
          One cookie holding a random number, so we can tell how many people
          come here and how many finish. No name, no email, no ad networks, and
          nothing sold. Say no and the poll works exactly the same.
        </p>

        <button
          onClick={() => setDetails((v) => !v)}
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ash hover:text-bone"
        >
          {details ? "Hide" : "Exactly what we store"}
        </button>

        {details && (
          <ul className="mt-3 space-y-1.5 border-l-2 border-edge pl-4 text-[13px] leading-relaxed text-ash">
            <li>A random ID we generate — not derived from you in any way.</li>
            <li>Which pages you opened, and when.</li>
            <li>
              The site you arrived from, domain only — never the full link.
            </li>
            <li>Rough device and browser, e.g. &quot;mobile, Safari&quot;.</li>
            <li>Country, if our host tells us. Never your IP address.</li>
            <li>
              Your answers are recorded either way — they are the poll — but
              without this they are not tied to a returning visitor.
            </li>
          </ul>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => decide(true)}
            className="choice flex-1 rounded-xl border border-power/50 bg-power/15 py-3 text-sm font-medium text-bone hover:bg-power/25"
          >
            Allow
          </button>
          <button
            onClick={() => decide(false)}
            className="choice flex-1 rounded-xl border border-edge bg-slab/60 py-3 text-sm font-medium text-ash hover:border-ash/50 hover:text-bone"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
