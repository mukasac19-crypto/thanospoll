import test from "node:test";
import assert from "node:assert/strict";

import {
  EFFECT_PROFILES,
  type Field,
  type Frame,
  type Particle,
} from "../lib/effects";
import { QUESTIONS } from "../lib/questions";
import { ORDER } from "../lib/engine";
import { STONES, effectFor, stonesUsed } from "../lib/stones";

/**
 * Canvas animation is driven by requestAnimationFrame, which fires zero times
 * in a hidden tab — so none of this is observable in an automated browser. The
 * motion is pure maths, though, so it can be stepped directly.
 */

const BOUNDS = {
  left: 100,
  top: 100,
  width: 400,
  height: 200,
  right: 500,
  bottom: 300,
  x: 100,
  y: 100,
} as DOMRect;

const FIELD: Field = {
  bounds: BOUNDS,
  cx: 300,
  cy: 200,
  reach: Math.hypot(400, 200) / 2,
};

/** Deterministic stand-in for Math.random, so failures are reproducible. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParticle(x: number, y: number): Particle {
  return {
    ox: x,
    oy: y,
    vx: 0,
    vy: 0,
    size: 1,
    delay: 0,
    life: 1,
    wobble: 0.3,
    r: 200,
    g: 200,
    b: 200,
  };
}

/** Seeds a particle and returns its frame at the given progress. */
function frameAt(effect: keyof typeof EFFECT_PROFILES, k: number, at = [180, 150]) {
  const profile = EFFECT_PROFILES[effect];
  const p = makeParticle(at[0], at[1]);
  profile.seed(p, FIELD, seededRandom(42));
  const out: Frame = { x: 0, y: 0, alpha: 0, size: 0 };
  profile.move(p, k, out);
  return { p, out };
}

const ALL = Object.keys(EFFECT_PROFILES) as (keyof typeof EFFECT_PROFILES)[];

test("every effect produces finite, sane frames across its whole life", () => {
  for (const effect of ALL) {
    for (const k of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      const { out } = frameAt(effect, k);
      assert.ok(Number.isFinite(out.x), `${effect} x at k=${k}`);
      assert.ok(Number.isFinite(out.y), `${effect} y at k=${k}`);
      assert.ok(
        out.alpha >= 0 && out.alpha <= 1,
        `${effect} alpha ${out.alpha} out of range at k=${k}`,
      );
      assert.ok(out.size > 0, `${effect} size ${out.size} at k=${k}`);
    }
  }
});

test("every effect has faded to nothing by the end", () => {
  for (const effect of ALL) {
    const { out } = frameAt(effect, 0.999);
    assert.ok(out.alpha < 0.05, `${effect} still visible at k=1 (${out.alpha})`);
  }
});

test("every effect seeds a delay and life that fit inside its duration", () => {
  for (const effect of ALL) {
    const { p } = frameAt(effect, 0.5);
    assert.ok(p.delay >= 0 && p.delay < 0.6, `${effect} delay ${p.delay}`);
    assert.ok(p.life > 0 && p.life <= 1, `${effect} life ${p.life}`);
    // A particle that starts after its own life ends never draws.
    assert.ok(p.delay + p.life > 0.2, `${effect} particle never visible`);
  }
});

const distance = (x: number, y: number) => Math.hypot(x - FIELD.cx, y - FIELD.cy);

test("power throws particles away from the centre", () => {
  const start = distance(180, 150);
  const { out } = frameAt("power", 0.6);
  assert.ok(
    distance(out.x, out.y) > start,
    "power should increase distance from centre",
  );
});

test("space pulls particles toward the centre and shrinks them", () => {
  const start = distance(180, 150);
  const { out } = frameAt("space", 0.8);
  assert.ok(
    distance(out.x, out.y) < start,
    `space should implode: ${distance(out.x, out.y)} vs ${start}`,
  );
  assert.ok(out.size < 1, "space should shrink particles");
});

test("time flies out and rewinds back to where it started", () => {
  const mid = frameAt("time", 0.5).out;
  const end = frameAt("time", 0.995).out;
  const start = { x: 180, y: 150 };

  const midTravel = Math.hypot(mid.x - start.x, mid.y - start.y);
  const endTravel = Math.hypot(end.x - start.x, end.y - start.y);

  assert.ok(midTravel > 20, `time should travel outward, got ${midTravel}`);
  assert.ok(
    endTravel < midTravel * 0.2,
    `time should return to origin, ended ${endTravel} away vs peak ${midTravel}`,
  );
});

test("soul rises rather than falling", () => {
  const { out } = frameAt("soul", 0.7);
  assert.ok(out.y < 150, `soul should drift upward, got y=${out.y}`);
});

test("soul brightens before it fades, instead of only fading", () => {
  const early = frameAt("soul", 0.05).out.alpha;
  const mid = frameAt("soul", 0.5).out.alpha;
  assert.ok(mid > early, "soul should peak mid-life");
});

test("reality sweeps left to right, so delay tracks x position", () => {
  const profile = EFFECT_PROFILES.reality;
  const rand = seededRandom(7);

  const left = makeParticle(BOUNDS.left + 5, 200);
  const right = makeParticle(BOUNDS.right - 5, 200);
  profile.seed(left, FIELD, rand);
  profile.seed(right, FIELD, rand);

  assert.ok(
    right.delay > left.delay,
    `right edge should dissolve later: ${right.delay} vs ${left.delay}`,
  );
});

test("space takes the outer edge first, the inverse of a normal burst", () => {
  const profile = EFFECT_PROFILES.space;
  const rand = seededRandom(11);

  const outer = makeParticle(BOUNDS.left + 2, BOUNDS.top + 2);
  const inner = makeParticle(FIELD.cx, FIELD.cy + 2);
  profile.seed(outer, FIELD, rand);
  profile.seed(inner, FIELD, rand);

  assert.ok(
    outer.delay < inner.delay,
    `outer should go first: ${outer.delay} vs ${inner.delay}`,
  );
});

test("gauntlet drifts up and to the right, like the films", () => {
  const { out } = frameAt("gauntlet", 0.8);
  assert.ok(out.x > 180, "gauntlet should drift right");
  assert.ok(out.y < 150, "gauntlet should drift up");
});

test("gauntlet tints particles across all six stones, not one", () => {
  const profile = EFFECT_PROFILES.gauntlet;
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    seen.add(profile.tint([232, 226, 242], i / 200).join(","));
  }
  assert.ok(seen.size >= 6, `expected six tints, got ${seen.size}`);
});

// ------------------------------------------------------------- mapping ----

test("every question maps to an effect", () => {
  for (const q of QUESTIONS) {
    assert.ok(effectFor(q.id), `no effect for ${q.id}`);
    assert.ok(EFFECT_PROFILES[effectFor(q.id)], `no profile for ${q.id}`);
  }
});

test("all six stones are used across a full run", () => {
  const used = stonesUsed(ORDER);
  assert.equal(used.size, STONES.length);
});

test("the Gauntlet completes on the question that asks you to use it", () => {
  const upToPress = ORDER.slice(0, ORDER.indexOf("press") + 1);
  const before = ORDER.slice(0, ORDER.indexOf("press"));

  assert.equal(
    stonesUsed(upToPress).size,
    STONES.length,
    "all six should be lit once 'would you press it' is answered",
  );
  assert.ok(
    stonesUsed(before).size < STONES.length,
    "the set should not already be complete before it",
  );
});

test("the all-six effect is saved for the flinch question", () => {
  const gauntletQuestions = QUESTIONS.filter(
    (q) => effectFor(q.id) === "gauntlet",
  ).map((q) => q.id);
  assert.deepEqual(gauntletQuestions, ["fifty"]);
});
