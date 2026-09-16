import type { Store } from "./types";
import { foldCross, rowsToTallies } from "./types";

/**
 * Raw Postgres driver, kept as the escape hatch: any Postgres, including
 * Supabase over its connection pooler, without the Supabase JS client. The
 * Supabase driver is the better path for a Supabase project — it needs no
 * connection string and no pooler tuning — but this one proves the Store
 * abstraction holds and means the app is not locked to a single host.
 *
 * Creates its own schema, so it does not need the SQL migration.
 */

const DDL = [
  `CREATE TABLE IF NOT EXISTS answers (
     session_id TEXT NOT NULL,
     qid        TEXT NOT NULL,
     choice     TEXT NOT NULL,
     position   INTEGER NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (session_id, qid)
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id         TEXT PRIMARY KEY,
     archetype  TEXT,
     chaos      INTEGER,
     visitor_id TEXT,
     supported  BOOLEAN,
     support_amount NUMERIC,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS answers_qid ON answers (qid)`,
  `CREATE TABLE IF NOT EXISTS visitors (
     id             TEXT PRIMARY KEY,
     first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
     visits         INTEGER NOT NULL DEFAULT 0,
     first_referrer TEXT,
     device         TEXT,
     browser        TEXT,
     country        TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS visits (
     id         BIGSERIAL PRIMARY KEY,
     visitor_id TEXT NOT NULL,
     path       TEXT NOT NULL,
     referrer   TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS visits_visitor ON visits (visitor_id)`,
];

export async function postgresStore(url: string): Promise<Store> {
  const { default: postgres } = await import("postgres");

  // Supabase's transaction pooler (port 6543) does not support prepared
  // statements. Detect it rather than making the caller remember.
  const isTransactionPooler = /:6543\//.test(url) || url.includes("pgbouncer=true");

  const sql = postgres(url, {
    ssl: "require",
    max: 4,
    prepare: !isTransactionPooler,
  });

  for (const stmt of DDL) await sql.unsafe(stmt);

  return {
    async recordAnswer(sessionId, qid, choice, position) {
      await sql`
        INSERT INTO answers (session_id, qid, choice, position)
        VALUES (${sessionId}, ${qid}, ${choice}, ${position})
        ON CONFLICT (session_id, qid) DO UPDATE SET choice = EXCLUDED.choice`;
    },

    async completeSession(sessionId, meta) {
      await sql`
        INSERT INTO sessions (id, archetype, chaos, visitor_id)
        VALUES (${sessionId}, ${meta.archetype}, ${meta.chaos}, ${meta.visitorId})
        ON CONFLICT (id) DO UPDATE SET
          archetype = EXCLUDED.archetype,
          chaos = EXCLUDED.chaos,
          visitor_id = COALESCE(EXCLUDED.visitor_id, sessions.visitor_id)`;
    },

    async tallies() {
      const rows = await sql<{ qid: string; choice: string; n: number }[]>`
        SELECT qid, choice, COUNT(*)::int AS n FROM answers GROUP BY qid, choice`;
      return rowsToTallies(rows);
    },

    async archetypes() {
      const rows = await sql<{ archetype: string; n: number }[]>`
        SELECT archetype, COUNT(*)::int AS n FROM sessions
        WHERE archetype IS NOT NULL GROUP BY archetype`;
      return Object.fromEntries(rows.map((r) => [r.archetype, Number(r.n)]));
    },

    async completedCount() {
      const [row] = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM sessions`;
      return Number(row?.n ?? 0);
    },

    async crossTab(a, b) {
      const rows = await sql<{ ca: string; cb: string; n: number }[]>`
        SELECT x.choice AS ca, y.choice AS cb, COUNT(*)::int AS n
        FROM answers x JOIN answers y ON x.session_id = y.session_id
        WHERE x.qid = ${a} AND y.qid = ${b}
        GROUP BY x.choice, y.choice`;
      return foldCross(rows);
    },

    async markSupported(sessionId, amount) {
      await sql`
        INSERT INTO sessions (id, supported, support_amount)
        VALUES (${sessionId}, true, ${amount})
        ON CONFLICT (id) DO UPDATE SET
          supported = true,
          support_amount = COALESCE(EXCLUDED.support_amount, sessions.support_amount)`;
    },

    async supportRate() {
      const [row] = await sql<Record<string, number>[]>`
        SELECT
          COUNT(*) FILTER (WHERE supported)::int AS supported,
          COUNT(*)::int AS completed
        FROM sessions`;
      return {
        supported: Number(row?.supported ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },

    async recordVisit(v) {
      await sql`
        INSERT INTO visitors
          (id, first_referrer, device, browser, country, visits)
        VALUES (${v.visitorId}, ${v.referrer}, ${v.device}, ${v.browser}, ${v.country}, 1)
        ON CONFLICT (id) DO UPDATE SET
          last_seen = now(),
          visits = visitors.visits + 1,
          device = COALESCE(visitors.device, EXCLUDED.device),
          browser = COALESCE(visitors.browser, EXCLUDED.browser),
          country = COALESCE(visitors.country, EXCLUDED.country)`;

      await sql`
        INSERT INTO visits (visitor_id, path, referrer)
        VALUES (${v.visitorId}, ${v.path}, ${v.referrer})`;
    },

    async visitorStats() {
      const [row] = await sql<Record<string, number>[]>`
        SELECT
          (SELECT COUNT(*)::int FROM visitors) AS visitors,
          (SELECT COALESCE(SUM(visits), 0)::int FROM visitors) AS visits,
          (SELECT COUNT(*)::int FROM visitors WHERE visits > 1) AS returning_visitors,
          (SELECT COUNT(*)::int FROM sessions) AS completed`;
      return {
        visitors: Number(row?.visitors ?? 0),
        visits: Number(row?.visits ?? 0),
        returning: Number(row?.returning_visitors ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },
  };
}
