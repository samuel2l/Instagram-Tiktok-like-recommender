import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./config.js";
import {
  getVideo,
  getReadyVideoSearchRecord,
  markVideoFailed,
  markVideoProcessing,
  markVideoReady
} from "./db.js";
import {
  createThumbnail,
  probeVideo,
  transcodeToHls,
  uploadDirectoryToR2
} from "./media.js";
import { downloadRawObject, uploadProcessedObject } from "./r2.js";
import { indexReadyVideo } from "./search.js";

export async function processUploadedVideo(videoId: string) {
  const video = await getVideo(videoId);

  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  if (!video.raw_object_key) {
    throw new Error(`Video has no raw object key: ${videoId}`);
  }

  await markVideoProcessing(videoId);

  await mkdir(env.WORKER_TMP_DIR, { recursive: true });
  const workspace = await mkdtemp(path.join(env.WORKER_TMP_DIR, "video-"));

  try {
    const sourcePath = path.join(workspace, "source");
    const outputDir = path.join(workspace, "hls");
    const thumbnailPath = path.join(workspace, "thumbnail.jpg");
    const processedPrefix = `processed/${video.creator_id}/${video.id}`;
    const hlsManifestKey = `${processedPrefix}/master.m3u8`;
    const thumbnailKey = `${processedPrefix}/thumbnail.jpg`;

    await downloadRawObject({
      objectKey: video.raw_object_key,
      destinationPath: sourcePath
    });

    const mediaInfo = await probeVideo(sourcePath);
    const hls = await transcodeToHls({
      sourcePath,
      outputDir,
      mediaInfo
    });

    await writeFile(path.join(outputDir, "master.m3u8"), hls.masterPlaylist);
    await createThumbnail({ sourcePath, outputPath: thumbnailPath });

    await uploadDirectoryToR2({
      outputDir,
      keyPrefix: processedPrefix
    });
    await uploadProcessedObject({
      objectKey: thumbnailKey,
      filePath: thumbnailPath,
      contentType: "image/jpeg"
    });

    await markVideoReady({
      videoId,
      hlsManifestKey,
      thumbnailKey,
      durationMs: mediaInfo.durationMs,
      width: mediaInfo.width,
      height: mediaInfo.height,
      metadata: {
        processedAt: new Date().toISOString(),
        renditions: hls.renditions.map((rendition) => rendition.name)
      }
    });

    const searchRecord = await getReadyVideoSearchRecord(videoId);

    if (searchRecord) {
      await indexReadyVideo({
        videoId: searchRecord.video_id,
        creatorId: searchRecord.creator_id,
        caption: searchRecord.caption,
        hashtags: searchRecord.hashtags ?? [],
        transcript: searchRecord.transcript,
        ocrText: searchRecord.ocr_text,
        hlsManifestKey: searchRecord.hls_manifest_key,
        thumbnailKey: searchRecord.thumbnail_key,
        durationMs: searchRecord.duration_ms,
        width: searchRecord.width,
        height: searchRecord.height,
        createdAt: searchRecord.created_at.toISOString(),
        readyAt: searchRecord.ready_at.toISOString()
      });
    }
  } catch (error) {
    await markVideoFailed({
      videoId,
      reason: error instanceof Error ? error.message : "Unknown processing error"
    });
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
