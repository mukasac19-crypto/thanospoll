import test from "node:test";
import assert from "node:assert/strict";

import {
  browserFrom,
  countryFrom,
  deviceFrom,
  isTrackablePath,
  parseConsent,
  referrerOrigin,
  signalsOptOut,
} from "../lib/visitor";

test("consent defaults to unset for anything unrecognised", () => {
  assert.equal(parseConsent("granted"), "granted");
  assert.equal(parseConsent("denied"), "denied");
  assert.equal(parseConsent(undefined), "unset");
  assert.equal(parseConsent(""), "unset");
  // A forged or corrupted cookie must never read as consent.
  assert.equal(parseConsent("true"), "unset");
  assert.equal(parseConsent("GRANTED"), "unset");
});

test("referrers are reduced to an origin, never a full URL", () => {
  assert.equal(
    referrerOrigin("https://www.google.com/search?q=very+personal+thing"),
    "https://www.google.com",
  );
  assert.equal(
    referrerOrigin("https://t.co/abc?token=secret#frag"),
    "https://t.co",
  );
  assert.equal(referrerOrigin(null), null);
  assert.equal(referrerOrigin("not a url"), null);
});

test("a referrer never leaks a query string", () => {
  const out = referrerOrigin("https://example.com/x?email=a@b.com&sid=99");
  assert.ok(out && !out.includes("?"), "origin must not contain a query");
  assert.ok(out && !out.includes("a@b.com"), "origin must not contain the email");
});

test("device buckets cover the shapes that matter", () => {
  assert.equal(
    deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile/15E"),
    "mobile",
  );
  assert.equal(deviceFrom("Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit"), "tablet");
  assert.equal(deviceFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)"), "desktop");
  assert.equal(deviceFrom(null), null);
});

test("browser detection resolves the ones that impersonate each other", () => {
  const chrome =
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  const edge = chrome + " Edg/120.0";
  const opera = chrome + " OPR/106.0";
  const safari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1 Version/17 Safari/605.1";

  // Edge and Opera both carry "Chrome" and "Safari" in their UA.
  assert.equal(browserFrom(edge), "Edge");
  assert.equal(browserFrom(opera), "Opera");
  assert.equal(browserFrom(chrome), "Chrome");
  assert.equal(browserFrom(safari), "Safari");
  assert.equal(browserFrom(null), null);
});

test("browser and device are buckets, never the raw user agent", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.6099.71";
  const browser = browserFrom(ua);
  const device = deviceFrom(ua);
  // The stored value must not be reconstructible into a fingerprint.
  assert.ok(browser && browser.length < 20 && !browser.includes("."));
  assert.ok(device && device.length < 12);
});

test("do-not-track and global privacy control are both honoured", () => {
  assert.equal(signalsOptOut({ dnt: "1", gpc: null }), true);
  assert.equal(signalsOptOut({ dnt: null, gpc: "1" }), true);
  assert.equal(signalsOptOut({ dnt: "0", gpc: "0" }), false);
  assert.equal(signalsOptOut({ dnt: null, gpc: null }), false);
});

test("country comes from CDN headers and never from an IP", () => {
  assert.equal(countryFrom({ "x-vercel-ip-country": "gb" }), "GB");
  assert.equal(countryFrom({ "cf-ipcountry": "KE" }), "KE");
  assert.equal(countryFrom({ "cf-ipcountry": "XX" }), null, "XX means unknown");
  assert.equal(countryFrom({}), null);
});

test("only real page paths are counted", () => {
  assert.equal(isTrackablePath("/"), true);
  assert.equal(isTrackablePath("/play"), true);
  assert.equal(isTrackablePath("/results"), true);
  assert.equal(isTrackablePath("/api/anything"), false);
  assert.equal(isTrackablePath("/_next/static/chunk.js"), false);
  assert.equal(isTrackablePath("/favicon.ico"), false);
  // A caller-supplied path must not be able to bloat the table.
  assert.equal(isTrackablePath("/" + "x".repeat(200)), false);
  assert.equal(isTrackablePath("https://evil.example.com"), false);
});
