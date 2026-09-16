"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackVisit } from "@/lib/analytics";
import { CONSENT_COOKIE } from "@/lib/visitor";

function hasConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((row) => row === `${CONSENT_COOKIE}=granted`);
}

/**
 * Records a page view per route, once. The consent check is repeated here even
 * though trackVisit enforces it server-side — no reason to make a request that
 * is guaranteed to do nothing.
 */
export function VisitTracker() {
  const pathname = usePathname();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || seen.current === pathname) return;
    if (!hasConsent()) return;
    seen.current = pathname;
    // Deliberately unawaited: a page view must never delay a render, and a
    // failure to count one is not worth surfacing to anybody.
    void trackVisit(pathname);
  }, [pathname]);

  return null;
}
