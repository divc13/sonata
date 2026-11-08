import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createClient(url: string) {
  /*
   * `prepare: false` keeps a pooled serverless connection compatible with
   * transaction-mode poolers (Neon's `-pooler` host, Supabase Supavisor).
   * Named prepared statements belong to one backend session, which a pooler
   * does not preserve; without this, the second query on a reused connection
   * can fail with "prepared statement already exists". One connection per
   * instance is deliberate under Vercel.
   */
  const client = postgres(url, { max: 1, prepare: false });
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createClient>;
