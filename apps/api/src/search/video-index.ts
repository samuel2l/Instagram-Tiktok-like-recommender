import { elasticsearch, videoIndexName } from "./client.js";

export async function ensureVideoSearchIndex() {
  const exists = await elasticsearch.indices.exists({
    index: videoIndexName
  });

  if (exists) {
    return;
  }

  await elasticsearch.indices.create({
    index: videoIndexName,
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
