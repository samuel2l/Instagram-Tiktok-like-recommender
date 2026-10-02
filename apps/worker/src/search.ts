import { Client } from "@elastic/elasticsearch";
import { env } from "./config.js";
import { getPublicMediaUrl } from "./urls.js";

export type VideoSearchDocument = {
  videoId: string;
  creatorId: string;
  caption: string | null;
  hashtags: string[];
  transcript: string | null;
  ocrText: string | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  readyAt: string;
};

export const elasticsearch = new Client({
  node: env.ELASTICSEARCH_NODE,
  auth: {
    apiKey: env.ELASTICSEARCH_API_KEY
  }
});

export async function ensureVideoSearchIndex() {
  const exists = await elasticsearch.indices.exists({
    index: env.ELASTICSEARCH_INDEX_VIDEOS
  });

  if (exists) {
    return;
  }

  await elasticsearch.indices.create({
    index: env.ELASTICSEARCH_INDEX_VIDEOS,
    mappings: {
      properties: {
        videoId: { type: "keyword" },
        creatorId: { type: "keyword" },
        caption: { type: "text" },
        hashtags: { type: "keyword" },
        transcript: { type: "text" },
        ocrText: { type: "text" },
        playbackUrl: { type: "keyword", index: false },
        thumbnailUrl: { type: "keyword", index: false },
        durationMs: { type: "integer" },
        width: { type: "integer" },
        height: { type: "integer" },
        createdAt: { type: "date" },
        readyAt: { type: "date" }
      }
    }
  });
}

export async function indexReadyVideo(document: Omit<VideoSearchDocument, "playbackUrl" | "thumbnailUrl"> & {
  hlsManifestKey: string | null;
  thumbnailKey: string | null;
}) {
  await elasticsearch.index<VideoSearchDocument>({
    index: env.ELASTICSEARCH_INDEX_VIDEOS,
    id: document.videoId,
    document: {
      videoId: document.videoId,
      creatorId: document.creatorId,
      caption: document.caption,
      hashtags: document.hashtags,
      transcript: document.transcript,
      ocrText: document.ocrText,
      playbackUrl: document.hlsManifestKey
        ? getPublicMediaUrl(document.hlsManifestKey)
        : null,
      thumbnailUrl: document.thumbnailKey
        ? getPublicMediaUrl(document.thumbnailKey)
        : null,
      durationMs: document.durationMs,
      width: document.width,
      height: document.height,
      createdAt: document.createdAt,
      readyAt: document.readyAt
    },
    refresh: "wait_for"
  });
}
