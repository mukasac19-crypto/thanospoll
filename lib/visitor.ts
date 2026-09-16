/**
 * Coarse client details, derived server-side from request headers.
 *
 * Everything here is deliberately lossy. The full user agent string is a
 * fingerprint — combined with a handful of other signals it can single out one
 * person — while "mobile / Safari" is what anyone actually reads in a
 * dashboard. So the bucket is what gets stored and the raw string is thrown
 * away.
 */

export type Consent = "granted" | "denied" | "unset";

export const VISITOR_COOKIE = "wtr_vid";
export const CONSENT_COOKIE = "wtr_consent";

/** A year. Long enough for "returning visitor" to mean something. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseConsent(value: string | undefined): Consent {
  return value === "granted" || value === "denied" ? value : "unset";
}

export function deviceFrom(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserFrom(ua: string | null): string | null {
  if (!ua) return null;
  // Order matters: most of these lie about being the others.
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

/**
 * Origin only. A full referrer URL can carry search terms, session tokens and
 * other personal data in its query string, none of which we want in a table.
 */
export function referrerOrigin(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.origin;
  } catch {
    return null;
  }
}

/** True when the browser has asked, by any of the usual signals, not to be tracked. */
export function signalsOptOut(headers: {
  dnt: string | null;
  gpc: string | null;
}): boolean {
  return headers.dnt === "1" || headers.gpc === "1";
}

/** Never store an IP. A two-letter country from the CDN is enough. */
export function countryFrom(
  headers: Record<string, string | null>,
): string | null {
  const raw =
    headers["x-vercel-ip-country"] ??
    headers["cf-ipcountry"] ??
    headers["x-country-code"] ??
    null;
  if (!raw || raw === "XX") return null;
  return raw.slice(0, 2).toUpperCase();
}

/** Paths worth counting. Keeps asset and action noise out of the table. */
export function isTrackablePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.length > 128) return false;
  return !/^\/(api|_next|favicon|robots|sitemap)/.test(path);
}
