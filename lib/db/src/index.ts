import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { getRuntimeDatabaseUrl } from "./test-safety";

const { Pool } = pg;

const connectionString = getRuntimeDatabaseUrl();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
