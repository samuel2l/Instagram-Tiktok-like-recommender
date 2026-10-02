import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

loadEnvFile("../../.env");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
