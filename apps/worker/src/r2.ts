import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "./config.js";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

export async function downloadRawObject(input: {
  objectKey: string;
  destinationPath: string;
}) {
  const response = await r2.send(
    new GetObjectCommand({
      Bucket: env.R2_RAW_BUCKET,
      Key: input.objectKey
    })
  );

  if (!response.Body) {
    throw new Error(`R2 object has no body: ${input.objectKey}`);
  }

  await pipeline(response.Body as Readable, createWriteStream(input.destinationPath));
}

export async function uploadProcessedObject(input: {
  objectKey: string;
  filePath: string;
  contentType: string;
}) {
  const body = await readFile(input.filePath);

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_PROCESSED_BUCKET,
      Key: input.objectKey,
      Body: body,
      ContentType: input.contentType
    })
  );
}
