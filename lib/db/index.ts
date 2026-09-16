import "server-only";
import type { Store } from "./types";

/**
 * Results storage: one interface, three drivers, chosen by environment.
 *
 *   Supabase   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   (production)
 *   Postgres   DATABASE_URL                               (any other host)
 *   SQLite     neither                                    (local dev)
 *
 * Nothing above this module knows which one is running.
 */

// Types and the pure fold helpers live in ./types, which carries no
// server-only marker — client components import from there directly.
export type { CrossTab, SessionMeta, Store, Tally } from "./types";

export type DriverName = "supabase" | "postgres" | "sqlite";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function activeDriver(): DriverName {
  if (SUPABASE_URL && SUPABASE_KEY) return "supabase";
  if (process.env.DATABASE_URL) return "postgres";
  return "sqlite";
}

async function connect(): Promise<Store> {
  switch (activeDriver()) {
    case "supabase": {
      const { supabaseStore } = await import("./supabase");
      return supabaseStore(SUPABASE_URL!, SUPABASE_KEY!);
    }
    case "postgres": {
      const { postgresStore } = await import("./postgres");
      return postgresStore(process.env.DATABASE_URL!);
    }
    default: {
      const { sqliteStore } = await import("./sqlite");
      return sqliteStore();
    }
  }
}

// Hot reload in dev would otherwise open a new handle on every edit.
const globalForDb = globalThis as unknown as { __thanosStore?: Promise<Store> };

export function getStore(): Promise<Store> {
  if (!globalForDb.__thanosStore) {
    // A rejected promise must not be cached, or one bad key at boot poisons
    // every request until the process restarts.
    const pending = connect();
    pending.catch(() => {
      if (globalForDb.__thanosStore === pending) {
        globalForDb.__thanosStore = undefined;
      }
    });
    globalForDb.__thanosStore = pending;
  }
  return globalForDb.__thanosStore;
}
