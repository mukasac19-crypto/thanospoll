import type { Store } from "./types";
import { foldCross, rowsToTallies } from "./types";

/**
 * Supabase driver.
 *
 * Writes go through the table API with the service role key, which bypasses
 * RLS. Reads go through the four aggregate functions defined in
 * supabase/migrations/0001_init.sql, because PostgREST cannot express GROUP BY
 * or a self-join — the alternative would be fetching every answer row into Node
 * and folding it there, which stops working the moment the poll gets traffic.
 */

function looksPublishable(key: string): boolean {
  // New-style publishable keys are prefixed; legacy anon keys are JWTs whose
  // payload carries role: "anon". Either one silently fails every write once
  // RLS is on, so it is worth catching at startup rather than at 2am.
  if (key.startsWith("sb_publishable_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { role?: string };
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export async function supabaseStore(
  url: string,
  serviceKey: string,
): Promise<Store> {
  if (looksPublishable(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY looks like an anon/publishable key. " +
        "Row level security will reject every write. Use the service role key " +
        "from Project Settings → API, and never expose it to the client.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async recordAnswer(sessionId, qid, choiceId, position) {
      const { error } = await db
        .from("answers")
        .upsert(
          { session_id: sessionId, qid, choice: choiceId, position },
          { onConflict: "session_id,qid" },
        );
      if (error) throw new Error(`recordAnswer: ${error.message}`);
    },

    async completeSession(sessionId, meta) {
      const { error } = await db.from("sessions").upsert(
        {
          id: sessionId,
          archetype: meta.archetype,
          chaos: meta.chaos,
          visitor_id: meta.visitorId,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(`completeSession: ${error.message}`);
    },

    async tallies() {
      const { data, error } = await db.rpc("poll_tallies");
      if (error) throw new Error(`tallies: ${error.message}`);
      return rowsToTallies(
        (data ?? []) as { qid: string; choice: string; n: number }[],
      );
    },

    async archetypes() {
      const { data, error } = await db.rpc("poll_archetypes");
      if (error) throw new Error(`archetypes: ${error.message}`);
      const rows = (data ?? []) as { archetype: string; n: number }[];
      return Object.fromEntries(rows.map((r) => [r.archetype, Number(r.n)]));
    },

    async completedCount() {
      const { data, error } = await db.rpc("poll_completed_count");
      if (error) throw new Error(`completedCount: ${error.message}`);
      return Number(data ?? 0);
    },

    async crossTab(a, b) {
      const { data, error } = await db.rpc("poll_cross_tab", {
        item_a: a,
        item_b: b,
      });
      if (error) throw new Error(`crossTab: ${error.message}`);
      return foldCross((data ?? []) as { ca: string; cb: string; n: number }[]);
    },

    async markSupported(sessionId, amount) {
      const row: Record<string, unknown> = { id: sessionId, supported: true };
      // Omitted rather than sent as null, so a custom-amount click never
      // wipes an amount already recorded for this session.
      if (amount !== null) row.support_amount = amount;
      const { error } = await db
        .from("sessions")
        .upsert(row, { onConflict: "id" });
      if (error) throw new Error(`markSupported: ${error.message}`);
    },

    async supportRate() {
      const { data, error } = await db.rpc("poll_support_rate");
      if (error) throw new Error(`supportRate: ${error.message}`);
      const row = (Array.isArray(data) ? data[0] : data) as
        | Record<string, number>
        | undefined;
      return {
        supported: Number(row?.supported ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },

    async recordVisit(v) {
      // One RPC rather than two table calls: PostgREST cannot express
      // "upsert and increment", and the counter must not race.
      const { error } = await db.rpc("record_visit", {
        p_visitor_id: v.visitorId,
        p_path: v.path,
        p_referrer: v.referrer,
        p_device: v.device,
        p_browser: v.browser,
        p_country: v.country,
      });
      if (error) throw new Error(`recordVisit: ${error.message}`);
    },

    async visitorStats() {
      const { data, error } = await db.rpc("poll_visitor_stats");
      if (error) throw new Error(`visitorStats: ${error.message}`);
      const row = (Array.isArray(data) ? data[0] : data) as
        | Record<string, number>
        | undefined;
      return {
        visitors: Number(row?.visitors ?? 0),
        visits: Number(row?.visits ?? 0),
        returning: Number(row?.returning_visitors ?? 0),
        completed: Number(row?.completed ?? 0),
      };
    },
  };
}
