/**
 * The support ask.
 *
 * Shown once the last question is answered and before the result. That is the
 * moment of peak attention, and also the moment someone is waiting for the
 * thing they earned — so the rule this module exists to keep is that the
 * result is never withheld. The ask is an interstitial, not a gate.
 */

export const SUPPORTED_KEY = "thanos.supported.v1";

/**
 * Payment destinations that may be configured.
 *
 * An allowlist rather than "any https URL", because these values decide where
 * everyone who finishes the poll gets sent. A typo should mean "no ask", never
 * "route the whole audience somewhere unexpected".
 *
 * Patreon covers fixed-price purchasable posts; the others are here because
 * Patreon cannot do customer-chosen amounts and a custom option has to live
 * somewhere.
 */
const SUPPORT_HOSTS = new Set([
  "patreon.com",
  "www.patreon.com",
  "ko-fi.com",
  "www.ko-fi.com",
  "buymeacoffee.com",
  "www.buymeacoffee.com",
  "buy.stripe.com",
  "donate.stripe.com",
  "paypal.me",
  "www.paypal.me",
]);

function validate(raw: string | undefined, hosts: Set<string>): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!hosts.has(url.hostname.toLowerCase())) return null;

  return url.toString();
}

/** Any allowed payment host. Used for tiers and the custom-amount link. */
export function supportUrl(raw: string | undefined): string | null {
  return validate(raw, SUPPORT_HOSTS);
}

/** Strictly Patreon. Used for the single-link fallback. */
export function patreonUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_PATREON_URL,
): string | null {
  return validate(raw, new Set(["patreon.com", "www.patreon.com"]));
}

export interface SupportTier {
  amount: number;
  url: string;
}

export interface SupportOptions {
  /** Fixed amounts, cheapest first. */
  tiers: SupportTier[];
  /** Where a customer-chosen amount goes, if anywhere. */
  customUrl: string | null;
  /** Used when no tiers are configured. */
  fallbackUrl: string | null;
  currency: string;
}

/**
 * Parses `10=https://…,20=https://…` into tiers.
 *
 * A malformed entry is dropped rather than throwing: one bad row in an env var
 * should cost that one button, not the whole ask.
 */
export function parseTiers(raw: string | undefined): SupportTier[] {
  if (!raw?.trim()) return [];

  const tiers: SupportTier[] = [];
  const seen = new Set<number>();

  for (const entry of raw.split(",")) {
    const split = entry.indexOf("=");
    if (split < 1) continue;

    const amount = Number(entry.slice(0, split).trim());
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (seen.has(amount)) continue;

    const url = supportUrl(entry.slice(split + 1));
    if (!url) continue;

    seen.add(amount);
    tiers.push({ amount, url });
  }

  return tiers.sort((a, b) => a.amount - b.amount);
}

export function supportOptions(env?: {
  tiers?: string;
  custom?: string;
  fallback?: string;
  currency?: string;
}): SupportOptions {
  return {
    tiers: parseTiers(env?.tiers ?? process.env.NEXT_PUBLIC_SUPPORT_TIERS),
    customUrl: supportUrl(
      env?.custom ?? process.env.NEXT_PUBLIC_SUPPORT_CUSTOM_URL,
    ),
    fallbackUrl: patreonUrl(env?.fallback ?? process.env.NEXT_PUBLIC_PATREON_URL),
    currency: (env?.currency ?? process.env.NEXT_PUBLIC_SUPPORT_CURRENCY ?? "$").trim(),
  };
}

export function hasSupportOptions(options: SupportOptions): boolean {
  return (
    options.tiers.length > 0 ||
    options.customUrl !== null ||
    options.fallbackUrl !== null
  );
}

export function isSupportConfigured(raw?: string): boolean {
  if (raw !== undefined) return patreonUrl(raw) !== null;
  return hasSupportOptions(supportOptions());
}

/** True once someone has followed a link. Supporters should not be asked again. */
export function hasSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SUPPORTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSupported(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUPPORTED_KEY, "1");
  } catch {
    // Private mode. They will be asked again, which is not worth handling.
  }
}

/** Whether to show the ask for this run. */
export function shouldAskForSupport(options?: {
  url?: string;
  supported?: boolean;
  configured?: boolean;
}): boolean {
  const configured =
    options?.configured ??
    (options?.url !== undefined
      ? isSupportConfigured(options.url)
      : isSupportConfigured());
  const supported = options?.supported ?? hasSupported();
  return configured && !supported;
}
