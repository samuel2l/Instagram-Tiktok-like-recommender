import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { elasticsearch, videoIndexName } from "../../search/client.js";
import { requireSession } from "../session.js";

type VideoSearchDocument = {
  videoId: string;
  creatorId: string;
  caption: string | null;
  hashtags?: string[];
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  readyAt: string;
};

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get("/search/videos", async (request) => {
    await requireSession(request);
    const query = z
      .object({
        q: z.string().trim().min(1),
        limit: z.coerce.number().int().min(1).max(50).default(20)
      })
      .parse(request.query);

    const results = await elasticsearch.search<VideoSearchDocument>({
      index: videoIndexName,
      size: query.limit,
      query: {
        multi_match: {
          query: query.q,
          fields: [
            "caption^3",
            "hashtags^2",
            "transcript",
            "ocrText"
          ],
          fuzziness: "AUTO"
        }
      },
      sort: [{ _score: { order: "desc" } }, { readyAt: { order: "desc" } }]
    });

    return {
      items: results.hits.hits.map((hit) => ({
        score: hit._score,
        ...hit._source
      }))
    };
  });
}
