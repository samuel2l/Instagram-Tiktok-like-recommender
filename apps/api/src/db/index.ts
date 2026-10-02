import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config.js";
import * as schema from "./schema.js";

const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });

export function closeDb() {
  return client.end();
}
