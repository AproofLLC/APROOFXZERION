import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

type NodeDb = NodePgDatabase<typeof schema>;
type PgliteDbType = PgliteDatabase<typeof schema>;

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

/** Node `pg` pool or embedded PGlite — same Drizzle schema. */
export type Db = NodeDb | PgliteDbType;

/** Transaction handle from either driver (used inside `db.transaction`). */
export type DbTransaction =
  | Parameters<Parameters<NodeDb["transaction"]>[0]>[0]
  | Parameters<Parameters<PgliteDbType["transaction"]>[0]>[0];
