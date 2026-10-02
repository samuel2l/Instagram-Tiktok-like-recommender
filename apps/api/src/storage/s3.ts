import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config.js";

export const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

export async function createRawVideoUploadUrl(input: {
  objectKey: string;
  contentType: string;
}) {
  const command = new PutObjectCommand({
    Bucket: env.R2_RAW_BUCKET,
    Key: input.objectKey,
    ContentType: input.contentType
  });

  return getSignedUrl(s3, command, { expiresIn: 60 * 10 });
}

export function getPublicMediaUrl(objectKey: string) {
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
}
