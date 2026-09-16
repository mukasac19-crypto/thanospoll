import type { Store } from "./types";
import { foldCross, rowsToTallies } from "./types";

/**
 * Local driver. node:sqlite ships with Node 22+, so development needs no
 * install and no service, and results are still genuinely shared across
 * everyone hitting the dev server.
 */

const DDL = `
CREATE TABLE IF NOT EXISTS answers (
  session_id TEXT NOT NULL,
  qid        TEXT NOT NULL,
  choice     TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, qid)
);
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  archetype  TEXT,
  chaos      INTEGER,
  visitor_id TEXT,
  supported  INTEGER,
  support_amount REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_qid ON answers (qid);
CREATE TABLE IF NOT EXISTS visitors (
  id             TEXT PRIMARY KEY,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  visits         INTEGER NOT NULL DEFAULT 0,
  first_referrer TEXT,
  device         TEXT,
  browser        TEXT,
  country        TEXT
);
CREATE TABLE IF NOT EXISTS visits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  path       TEXT NOT NULL,
  referrer   TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_visitor ON visits (visitor_id);
`;

export async function sqliteStore(): Promise<Store> {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdirSync } = await import("node:fs");
  const path = await import("node:path");

  const dir = path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "thanos.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(DDL);

  return {
    async recordAnswer(sessionId, qid, choice, position) {
      db.prepare(
        `INSERT INTO answers (session_id, qid, choice, position, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (session_id, qid) DO UPDATE SET choice = excluded.choice`,
      ).run(sessionId, qid, choice, position, Date.now());
    },

    async completeSession(sessionId, meta) {
      db.prepare(
        `INSERT INTO sessions (id, archetype, chaos, visitor_id, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           archetype = excluded.archetype,
           chaos = excluded.chaos,
           visitor_id = COALESCE(excluded.visitor_id, sessions.visitor_id)`,
      ).run(
        sessionId,
        meta.archetype,
        meta.chaos,
        meta.visitorId,
        Date.now(),
      );
    },

    async tallies() {
      const rows = db
        .prepare(
          `SELECT qid, choice, COUNT(*) AS n FROM answers GROUP BY qid, choice`,
        )
        .all() as unknown as { qid: string; choice: string; n: number }[];
      return rowsToTallies(rows);
    },

    async archetypes() {
      const rows = db
        .prepare(
          `SELECT archetype, COUNT(*) AS n FROM sessions
           WHERE archetype IS NOT NULL GROUP BY archetype`,
        )
        .all() as unknown as { archetype: string; n: number }[];
      return Object.fromEntries(rows.map((r) => [r.archetype, Number(r.n)]));
    },

    async completedCount() {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as
        | { n: number }
        | undefined;
      return Number(row?.n ?? 0);
    },

    async crossTab(a, b) {
      const rows = db
        .prepare(
          `SELECT x.choice AS ca, y.choice AS cb, COUNT(*) AS n
           FROM answers x JOIN answers y ON x.session_id = y.session_id
           WHERE x.qid = ? AND y.qid = ?
           GROUP BY x.choice, y.choice`,
        )
        .all(a, b) as unknown as { ca: string; cb: string; n: number }[];
      return foldCross(rows);
    },

    async markSupported(sessionId, amount) {
      // The row may not exist yet: the ask is shown before the result, and
      // completeSession races with it. Insert-or-update covers both orders.
      db.prepare(
        `INSERT INTO sessions (id, supported, support_amount, created_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           supported = 1,
           support_amount = COALESCE(excluded.support_amount, sessions.support_amount)`,
      ).run(sessionId, amount, Date.now());
    },

    async supportRate() {
      const row = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN supported = 1 THEN 1 ELSE 0 END), 0) AS supported,
             COUNT(*) AS completed
           FROM sessions`,
        )
        .get() as Record<string, number> | undefined;
      return {
        supported: Number(row?.supported ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },

    async recordVisit(v) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO visitors
           (id, first_seen, last_seen, visits, first_referrer, device, browser, country)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           last_seen = excluded.last_seen,
           visits = visitors.visits + 1,
           device = COALESCE(visitors.device, excluded.device),
           browser = COALESCE(visitors.browser, excluded.browser),
           country = COALESCE(visitors.country, excluded.country)`,
      ).run(v.visitorId, now, now, v.referrer, v.device, v.browser, v.country);

      db.prepare(
        `INSERT INTO visits (visitor_id, path, referrer, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(v.visitorId, v.path, v.referrer, now);
    },

    async visitorStats() {
      const row = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM visitors) AS visitors,
             (SELECT COALESCE(SUM(visits), 0) FROM visitors) AS visits,
             (SELECT COUNT(*) FROM visitors WHERE visits > 1) AS returning_visitors,
             (SELECT COUNT(*) FROM sessions) AS completed`,
        )
        .get() as Record<string, number> | undefined;
      return {
        visitors: Number(row?.visitors ?? 0),
        visits: Number(row?.visits ?? 0),
        returning: Number(row?.returning_visitors ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },
  };
}
