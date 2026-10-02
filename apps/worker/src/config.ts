import { loadEnvFile } from "node:process";
import { z } from "zod";

loadEnvFile("../../.env");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_EXCHANGE: z.string().default("reels.events"),
  RABBITMQ_VIDEO_QUEUE: z.string().default("video-processing.queue"),
  RABBITMQ_EVENTS_QUEUE: z.string().default("recommendation-events.queue"),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_RAW_BUCKET: z.string().min(1),
  R2_PROCESSED_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  ELASTICSEARCH_NODE: z.string().url(),
  ELASTICSEARCH_API_KEY: z.string().min(1),
  ELASTICSEARCH_INDEX_VIDEOS: z.string().default("reels-videos"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  WORKER_TMP_DIR: z.string().default("/tmp/reels-worker")
});

export const env = envSchema.parse(process.env);
