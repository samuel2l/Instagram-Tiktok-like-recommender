import { loadEnvFile } from "node:process";
import { z } from "zod";

loadEnvFile("../../.env");

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_RAW_BUCKET: z.string().min(1),
  R2_PROCESSED_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
  RABBITMQ_EXCHANGE: z.string().default("reels.events"),
  ELASTICSEARCH_NODE: z.string().url(),
  ELASTICSEARCH_API_KEY: z.string().min(1),
  ELASTICSEARCH_INDEX_VIDEOS: z.string().default("reels-videos")
});

export const env = envSchema.parse(process.env);
