import { env } from "./config.js";

export function getPublicMediaUrl(objectKey: string) {
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
}
