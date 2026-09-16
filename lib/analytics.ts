"use server";

import { cookies, headers } from "next/headers";
import { nanoid } from "nanoid";
import { getStore } from "./db";
import type { VisitorStats } from "./db/types";
import {
  COOKIE_MAX_AGE,
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  browserFrom,
  countryFrom,
  deviceFrom,
  isTrackablePath,
  parseConsent,
  referrerOrigin,
  signalsOptOut,
  type Consent,
} from "./visitor";

/**
 * Visitor analytics.
 *
 * The rule this file exists to enforce: no cookie is written, and no row is
 * recorded, until someone has actively said yes. An analytics cookie is not
 * "strictly necessary" for the poll to work, so under GDPR/ePrivacy it needs
 * opt-in consent — a banner shown while the cookie is already set is not
 * consent, it is an announcement.
 *
 * The id is minted here with nanoid and is not derived from anything about the
 * person. No IP, no raw user agent, no fingerprint is ever stored.
 */

export async function getConsent(): Promise<Consent> {
  const jar = await cookies();
  return parseConsent(jar.get(CONSENT_COOKIE)?.value);
}

export async function setConsent(granted: boolean): Promise<void> {
  const jar = await cookies();

  jar.set(CONSENT_COOKIE, granted ? "granted" : "denied", {
    httpOnly: false, // The banner needs to know it has been answered.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  // Withdrawing consent has to actually remove the identifier, not just stop
  // adding to it. Anything already collected is unlinked from here on.
  if (!granted) jar.delete(VISITOR_COOKIE);
}

/**
 * Records one page view. Returns quietly and changes nothing unless consent has
 * been granted, so calling it before the banner is answered is harmless.
 */
export async function trackVisit(path: string): Promise<void> {
  if (!isTrackablePath(path)) return;

  const jar = await cookies();
  if (parseConsent(jar.get(CONSENT_COOKIE)?.value) !== "granted") return;

  const head = await headers();
  const get = (name: string) => head.get(name);

  // Honoured even over an explicit yes: a browser-level opt-out is a standing
  // instruction, and it costs nothing to respect it.
  if (signalsOptOut({ dnt: get("dnt"), gpc: get("sec-gpc") })) return;

  let visitorId = jar.get(VISITOR_COOKIE)?.value;
  if (!visitorId || visitorId.length < 12 || visitorId.length > 40) {
    visitorId = nanoid(21);
    jar.set(VISITOR_COOKIE, visitorId, {
      // The client never needs to read this, and httpOnly keeps it out of
      // reach of any script that manages to run on the page.
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }

  const ua = get("user-agent");

  try {
    const store = await getStore();
    await store.recordVisit({
      visitorId,
      path,
      referrer: referrerOrigin(get("referer")),
      device: deviceFrom(ua),
      browser: browserFrom(ua),
      country: countryFrom({
        "x-vercel-ip-country": get("x-vercel-ip-country"),
        "cf-ipcountry": get("cf-ipcountry"),
        "x-country-code": get("x-country-code"),
      }),
    });
  } catch (error) {
    // Analytics must never break the page it is measuring — but it must not
    // fail silently forever either. A broken migration or a revoked grant
    // looks exactly like "nobody visited" if this is swallowed whole, so the
    // reason gets logged even though the request still succeeds.
    console.warn("[analytics] visit not recorded:", error);
  }
}

/** The visitor id for the current request, or null if there is not one. */
export async function currentVisitorId(): Promise<string | null> {
  const jar = await cookies();
  if (parseConsent(jar.get(CONSENT_COOKIE)?.value) !== "granted") return null;
  return jar.get(VISITOR_COOKIE)?.value ?? null;
}

export async function getVisitorStats(): Promise<VisitorStats> {
  const store = await getStore();
  return store.visitorStats();
}
