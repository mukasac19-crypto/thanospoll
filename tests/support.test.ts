import test from "node:test";
import assert from "node:assert/strict";

import {
  hasSupportOptions,
  isSupportConfigured,
  parseTiers,
  patreonUrl,
  shouldAskForSupport,
  supportOptions,
  supportUrl,
} from "../lib/support";

/**
 * The env var here decides where everyone who finishes the poll gets sent, so
 * it is validated rather than trusted. A typo should mean "no ask", never
 * "send the whole audience somewhere unexpected".
 */

test("accepts a real Patreon URL", () => {
  assert.equal(
    patreonUrl("https://www.patreon.com/thanospoll"),
    "https://www.patreon.com/thanospoll",
  );
  assert.equal(patreonUrl("https://patreon.com/c/someone"), "https://patreon.com/c/someone");
});

test("tolerates surrounding whitespace from a copy-paste", () => {
  assert.equal(
    patreonUrl("  https://patreon.com/x  "),
    "https://patreon.com/x",
  );
});

test("treats an unset or empty variable as not configured", () => {
  assert.equal(patreonUrl(undefined), null);
  assert.equal(patreonUrl(""), null);
  assert.equal(patreonUrl("   "), null);
  assert.equal(isSupportConfigured(undefined), false);
});

test("rejects anything that is not https", () => {
  assert.equal(patreonUrl("http://patreon.com/x"), null, "plain http");
  assert.equal(patreonUrl("javascript:alert(1)"), null, "script url");
  assert.equal(patreonUrl("//patreon.com/x"), null, "protocol relative");
});

test("rejects hosts that merely look like Patreon", () => {
  // The whole point of the check: a lookalike domain must not pass.
  assert.equal(patreonUrl("https://patreon.com.evil.example/x"), null);
  assert.equal(patreonUrl("https://notpatreon.com/x"), null);
  assert.equal(patreonUrl("https://evil.example/patreon.com"), null);
  assert.equal(patreonUrl("https://patreon.co/x"), null);
});

test("rejects malformed input instead of throwing", () => {
  assert.equal(patreonUrl("not a url"), null);
  assert.equal(patreonUrl("patreon.com/x"), null, "no protocol");
});

test("the ask is skipped unless a valid link is configured", () => {
  assert.equal(
    shouldAskForSupport({ url: undefined, supported: false }),
    false,
    "no link means no ask",
  );
  assert.equal(
    shouldAskForSupport({ url: "https://patreon.com/x", supported: false }),
    true,
  );
});

test("someone who already supported is never asked again", () => {
  assert.equal(
    shouldAskForSupport({ url: "https://patreon.com/x", supported: true }),
    false,
  );
});

// --------------------------------------------------------------- tiers ----

test("parses amounts into sorted tiers", () => {
  const tiers = parseTiers(
    "30=https://www.patreon.com/posts/3,10=https://www.patreon.com/posts/1,20=https://www.patreon.com/posts/2",
  );
  assert.deepEqual(
    tiers.map((t) => t.amount),
    [10, 20, 30],
    "cheapest first regardless of how they were written",
  );
  assert.equal(tiers[0].url, "https://www.patreon.com/posts/1");
});

test("drops a malformed tier instead of losing the whole ask", () => {
  const tiers = parseTiers(
    [
      "10=https://www.patreon.com/posts/1",
      "notanumber=https://www.patreon.com/posts/2",
      "20=https://evil.example/steal",
      "0=https://www.patreon.com/posts/4",
      "-5=https://www.patreon.com/posts/5",
      "50=https://www.patreon.com/posts/6",
    ].join(","),
  );
  assert.deepEqual(
    tiers.map((t) => t.amount),
    [10, 50],
    "bad host, non-numeric, zero and negative all dropped",
  );
});

test("a duplicate amount is ignored rather than rendered twice", () => {
  const tiers = parseTiers(
    "10=https://www.patreon.com/posts/1,10=https://www.patreon.com/posts/9",
  );
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].url, "https://www.patreon.com/posts/1", "first wins");
});

test("empty or absent tier config yields no tiers", () => {
  assert.deepEqual(parseTiers(undefined), []);
  assert.deepEqual(parseTiers(""), []);
  assert.deepEqual(parseTiers("   "), []);
  assert.deepEqual(parseTiers("garbage"), []);
});

test("custom-amount hosts are allowed, arbitrary ones are not", () => {
  // Patreon cannot do customer-chosen amounts, so these have to be permitted.
  assert.ok(supportUrl("https://ko-fi.com/thanospoll"));
  assert.ok(supportUrl("https://buymeacoffee.com/thanospoll"));
  assert.ok(supportUrl("https://buy.stripe.com/abc123"));
  assert.equal(supportUrl("https://evil.example/pay"), null);
  assert.equal(supportUrl("http://ko-fi.com/x"), null, "must be https");
});

test("the ask is skipped only when nothing at all is configured", () => {
  const none = supportOptions({ tiers: "", custom: "", fallback: "" });
  assert.equal(hasSupportOptions(none), false);

  const tiersOnly = supportOptions({
    tiers: "10=https://www.patreon.com/posts/1",
    custom: "",
    fallback: "",
  });
  assert.equal(hasSupportOptions(tiersOnly), true);

  const customOnly = supportOptions({
    tiers: "",
    custom: "https://ko-fi.com/x",
    fallback: "",
  });
  assert.equal(hasSupportOptions(customOnly), true);
});

test("currency defaults to a dollar sign", () => {
  assert.equal(supportOptions({ tiers: "", custom: "", fallback: "" }).currency, "$");
  assert.equal(
    supportOptions({ tiers: "", custom: "", fallback: "", currency: "£" }).currency,
    "£",
  );
});
