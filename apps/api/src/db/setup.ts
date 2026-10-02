import { loadEnvFile } from "node:process";
import postgres from "postgres";

loadEnvFile("../../.env");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to set up the database");
}

const client = postgres(databaseUrl, { prepare: false });

try {
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("Database extension ready: vector");
} finally {
  await client.end();
}
