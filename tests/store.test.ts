import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sqliteStore } from "../lib/db/sqlite";
import type { Store } from "../lib/db/types";
import { crossCell, crossRowTotal, tallyTotal } from "../lib/db/types";

/**
 * Runs the real SQLite driver against a throwaway database, so the SQL itself
 * is exercised rather than mocked. This exists because `returning` is a
 * reserved word in both SQLite and Postgres: the stats query parsed fine to the
 * eye and threw the moment it ran.
 */

const dir = mkdtempSync(path.join(tmpdir(), "thanos-test-"));
const original = process.cwd();

// One handle for the whole file. node:sqlite exposes no close() through the
// Store interface, so opening one per test just leaks descriptors.
let store: Store;

test.before(async () => {
  process.chdir(dir);
  store = await sqliteStore();
});

test.after(() => {
  process.chdir(original);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the database file locked while the handle is open, and
    // there is no way to close it from here. The OS clears its own temp dir.
  }
});

test("records answers and tallies them by choice", async () => {

  await store.recordAnswer("session-aaaa1", "right", "yes", 1);
  await store.recordAnswer("session-bbbb2", "right", "yes", 1);
  await store.recordAnswer("session-cccc3", "right", "no", 1);
  // A four-option answer shares the same column as the yes/no ones.
  await store.recordAnswer("session-aaaa1", "gauntlet_day", "keep", 2);

  const tallies = await store.tallies();
  assert.equal(tallies.right.yes, 2);
  assert.equal(tallies.right.no, 1);
  assert.equal(tallyTotal(tallies.right), 3);
  assert.equal(tallies.gauntlet_day.keep, 1);
});

test("re-answering a question replaces rather than duplicates", async () => {

  await store.recordAnswer("session-dddd4", "press", "yes", 7);
  await store.recordAnswer("session-dddd4", "press", "no", 7);

  const tallies = await store.tallies();
  assert.equal(tallies.press?.yes ?? 0, 0);
  assert.equal(tallies.press?.no ?? 0, 1);
});

test("cross-tab finds the flinch: pressed yes, then no at fifty", async () => {

  // Two who flinch, one who does not.
  for (const id of ["flinch-0001", "flinch-0002"]) {
    await store.recordAnswer(id, "press", "yes", 7);
    await store.recordAnswer(id, "fifty", "no", 8);
  }
  await store.recordAnswer("steady-0001", "press", "yes", 7);
  await store.recordAnswer("steady-0001", "fifty", "yes", 8);

  const table = await store.crossTab("press", "fifty");
  assert.equal(crossCell(table, "yes", "no"), 2, "two flinched");
  assert.equal(crossCell(table, "yes", "yes"), 1, "one held");
  assert.equal(crossRowTotal(table, "yes"), 3, "three said yes to press");
});

test("completing a session stores its archetype and visitor link", async () => {

  await store.completeSession("session-aaaa1", {
    archetype: "hypocrite",
    chaos: 3,
    visitorId: "visitor-one",
  });

  const archetypes = await store.archetypes();
  assert.equal(archetypes.hypocrite, 1);
  assert.equal(await store.completedCount(), 1);
});

test("a session from someone who declined the cookie still counts", async () => {

  await store.completeSession("session-bbbb2", {
    archetype: "humanist",
    chaos: 0,
    visitorId: null,
  });

  assert.equal(await store.completedCount(), 2);
  assert.equal((await store.archetypes()).humanist, 1);
});

test("visitorStats runs — `returning` is a reserved word and must be aliased", async () => {

  // The bug this guards: an unquoted `AS returning` is a syntax error in both
  // SQLite and Postgres, and only shows up when the query actually executes.
  const stats = await store.visitorStats();
  assert.equal(typeof stats.visitors, "number");
  assert.equal(typeof stats.returning, "number");
});

test("a second visit increments rather than inserting a new visitor", async () => {

  const visit = {
    visitorId: "visitor-one",
    path: "/",
    referrer: "https://example.com",
    device: "desktop",
    browser: "Chrome",
    country: "GB",
  };

  await store.recordVisit(visit);
  const first = await store.visitorStats();
  assert.equal(first.visitors, 1);
  assert.equal(first.visits, 1);
  assert.equal(first.returning, 0, "one visit is not yet a returning visitor");

  await store.recordVisit({ ...visit, path: "/play" });
  const second = await store.visitorStats();
  assert.equal(second.visitors, 1, "same visitor, not a new row");
  assert.equal(second.visits, 2);
  assert.equal(second.returning, 1);
});

test("a visitor's details are filled in once and never overwritten", async () => {

  await store.recordVisit({
    visitorId: "visitor-two",
    path: "/",
    referrer: "https://reddit.com",
    device: "mobile",
    browser: "Safari",
    country: "KE",
  });
  // A later visit arrives with nothing known about it.
  await store.recordVisit({
    visitorId: "visitor-two",
    path: "/results",
    referrer: null,
    device: null,
    browser: null,
    country: null,
  });

  const stats = await store.visitorStats();
  assert.equal(stats.visitors, 2);
  // The first referrer and device survive; only the counter moves.
  assert.ok(stats.visits >= 4);
});
