import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { attachCaptionHashtags } from "../../content/hashtags.js";
import { buildCommentTree } from "../../comments.js";
import { db } from "../../db/index.js";
import { comments, notifications, user, videos } from "../../db/schema.js";
import { publishEvent } from "../../events/producer.js";
import { scoreRecommendationCandidate } from "../../recommendation.js";
import { buildNotificationMessage } from "../../social.js";
import {
  createRawVideoUploadUrl,
  getPublicMediaUrl
} from "../../storage/s3.js";
import { requireSession } from "../session.js";

const createUploadInput = z.object({
  caption: z.string().max(2200).optional(),
  contentType: z.string().min(1).default("video/mp4"),
  extension: z.string().min(1).max(12).default("mp4"),
  visibility: z.enum(["public", "private", "unlisted"]).default("public")
});

export async function registerVideoRoutes(app: FastifyInstance) {
  app.post("/videos/upload-url", async (request) => {
    const session = await requireSession(request);
    const input = createUploadInput.parse(request.body);
    const safeExtension = input.extension.replace(/[^a-zA-Z0-9]/g, "") || "mp4";
    const objectKey = `raw/${session.user.id}/${Date.now()}-${nanoid(10)}.${safeExtension}`;
    const [video] = await db
      .insert(videos)
      .values({
        creatorId: session.user.id,
        caption: input.caption ?? null,
        visibility: input.visibility,
        rawObjectKey: objectKey,
        status: "uploading"
      })
      .returning();
    const extractedHashtags = await attachCaptionHashtags({
      videoId: video.id,
      caption: video.caption
    });
    const uploadUrl = await createRawVideoUploadUrl({
      objectKey,
      contentType: input.contentType
    });

    return {
      videoId: video.id,
      objectKey,
      uploadUrl,
      method: "PUT",
      expiresInSeconds: 600,
      hashtags: extractedHashtags
    };
  });

  app.post("/videos/:id/upload-complete", async (request) => {
    const session = await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, params.id));

    if (!video || video.creatorId !== session.user.id) {
      throw app.httpErrors.notFound("Video not found");
    }

    const [updatedVideo] = await db
      .update(videos)
      .set({
        status: "processing",
        updatedAt: new Date()
      })
      .where(eq(videos.id, video.id))
      .returning();

    await publishEvent("video.uploaded", video.id, {
      type: "video.uploaded",
      videoId: video.id,
      rawObjectKey: video.rawObjectKey,
      creatorId: video.creatorId,
      createdAt: new Date().toISOString()
    });

    return { video: updatedVideo };
  });

  app.get("/videos/:id", async (request) => {
    await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [video] = await db.select().from(videos).where(eq(videos.id, params.id));

    if (!video) {
      throw app.httpErrors.notFound("Video not found");
    }

    return {
      video: {
        ...video,
        playbackUrl: video.hlsManifestKey
          ? getPublicMediaUrl(video.hlsManifestKey)
          : null,
        thumbnailUrl: video.thumbnailKey
          ? getPublicMediaUrl(video.thumbnailKey)
          : null
      }
    };
  });

  app.get("/videos/:id/processing-status", async (request) => {
    await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [video] = await db.select().from(videos).where(eq(videos.id, params.id));

    if (!video) {
      throw app.httpErrors.notFound("Video not found");
    }

    return {
      video: {
        id: video.id,
        status: video.status,
        playbackUrl: video.hlsManifestKey
          ? getPublicMediaUrl(video.hlsManifestKey)
          : null,
        thumbnailUrl: video.thumbnailKey
          ? getPublicMediaUrl(video.thumbnailKey)
          : null,
        durationMs: video.durationMs,
        width: video.width,
        height: video.height,
        updatedAt: video.updatedAt
      }
    };
  });

  app.get("/videos/:id/comments", async (request) => {
    await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const videoComments = await db
      .select()
      .from(comments)
      .where(eq(comments.videoId, params.id));

    return {
      items: buildCommentTree(videoComments)
    };
  });

  app.post("/videos/:id/comments", async (request) => {
    const session = await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        body: z.string().trim().min(1).max(2000),
        parentId: z.string().uuid().optional()
      })
      .parse(request.body);
    const [video] = await db.select().from(videos).where(eq(videos.id, params.id));

    if (!video) {
      throw app.httpErrors.notFound("Video not found");
    }

    if (input.parentId) {
      const [parentComment] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.parentId));

      if (!parentComment || parentComment.videoId !== video.id) {
        throw app.httpErrors.badRequest("Comment parent not found");
      }
    }

    const [comment] = await db
      .insert(comments)
      .values({
        userId: session.user.id,
        videoId: video.id,
        parentId: input.parentId ?? null,
        body: input.body
      })
      .returning();

    if (session.user.id !== video.creatorId) {
      const [actor] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, session.user.id));

      await db.insert(notifications).values({
        userId: video.creatorId,
        actorUserId: session.user.id,
        type: input.parentId ? "reply" : "comment",
        entityType: "video",
        entityId: video.id,
        message: buildNotificationMessage(
          input.parentId ? "reply" : "comment",
          actor?.name ?? "Someone"
        ),
        metadata: {
          videoId: video.id,
          commentId: comment.id,
          parentId: input.parentId ?? null
        }
      });
    }

    return { comment };
  });

  app.post("/comments/:id/replies", async (request) => {
    const session = await requireSession(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ body: z.string().trim().min(1).max(2000) }).parse(request.body);
    const [parentComment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, params.id));

    if (!parentComment) {
      throw app.httpErrors.notFound("Comment not found");
    }

    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, parentComment.videoId));

    if (!video) {
      throw app.httpErrors.notFound("Video not found");
    }

    const [comment] = await db
      .insert(comments)
      .values({
        userId: session.user.id,
        videoId: parentComment.videoId,
        parentId: parentComment.id,
        body: input.body
      })
      .returning();

    const [actor] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, session.user.id));

    if (parentComment.userId !== session.user.id) {
      await db.insert(notifications).values({
        userId: parentComment.userId,
        actorUserId: session.user.id,
        type: "reply",
        entityType: "comment",
        entityId: parentComment.id,
        message: buildNotificationMessage("reply", actor?.name ?? "Someone"),
        metadata: {
          videoId: parentComment.videoId,
          commentId: comment.id,
          parentId: parentComment.id
        }
      });
    }

    return { comment };
  });

  app.get("/feed", async (request) => {
    const session = await requireSession(request);
    const query = z
      .object({
        limit: z.coerce.number().min(1).max(50).default(10)
      })
      .parse(request.query);

    const feedVideos = await db.execute<{
      id: string;
      creator_id: string;
      caption: string | null;
      hashtags: string[] | null;
      hls_manifest_key: string | null;
      thumbnail_key: string | null;
      created_at: Date;
      candidate_source: string;
      freshness_hours: number | null;
      creator_affinity: number | null;
      topic_affinity: number | null;
      completion_rate: number | null;
      engagement_quality: number | null;
      negative_feedback_penalty: number | null;
      seen_penalty: number | null;
    }>(sql`
      WITH viewer_seen AS (
        SELECT video_id
        FROM user_video_interactions
        WHERE user_id = ${session.user.id}
          AND (
            has_impressed = TRUE
            OR has_played = TRUE
            OR has_completed = TRUE
            OR has_skipped = TRUE
            OR not_interested = TRUE
          )
      ),
      creator_followed AS (
        SELECT videos.id
        FROM videos
        INNER JOIN follows ON follows.following_id = videos.creator_id
        WHERE follows.follower_id = ${session.user.id}
      ),
      creator_window AS (
        SELECT
          videos.id,
          COUNT(*) OVER (
            PARTITION BY videos.creator_id
            ORDER BY videos.created_at DESC
          ) AS creator_rank
        FROM videos
        WHERE videos.status = 'ready'
          AND videos.visibility = 'public'
      )
      SELECT
        videos.id,
        videos.creator_id,
        videos.caption,
        COALESCE(array_agg(DISTINCT hashtags.slug) FILTER (WHERE hashtags.slug IS NOT NULL), '{}') AS hashtags,
        videos.hls_manifest_key,
        videos.thumbnail_key,
        videos.created_at,
        CASE
          WHEN viewer_seen.video_id IS NOT NULL THEN 'seen'
          WHEN EXISTS (
            SELECT 1
            FROM follows
            WHERE follows.follower_id = ${session.user.id}
              AND follows.following_id = videos.creator_id
          ) THEN 'followed'
          WHEN videos.created_at > NOW() - INTERVAL '3 days' THEN 'fresh'
          WHEN COALESCE(video_metrics.likes, 0) > 0 OR COALESCE(video_metrics.saves, 0) > 0 THEN 'similar'
          WHEN COALESCE(video_metrics.impressions, 0) < 5 THEN 'exploration'
          ELSE 'topic'
        END AS candidate_source,
        EXTRACT(EPOCH FROM (NOW() - videos.created_at)) / 3600.0 AS freshness_hours,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM follows
            WHERE follows.follower_id = ${session.user.id}
              AND follows.following_id = videos.creator_id
          ) THEN 1.0
          ELSE 0.0
        END AS creator_affinity,
        CASE
          WHEN COALESCE(video_metrics.likes, 0) > 0 OR COALESCE(video_metrics.saves, 0) > 0 THEN 0.8
          WHEN COALESCE(video_metrics.watch_progress_events, 0) > 0 THEN 0.5
          ELSE 0.2
        END AS topic_affinity,
        CASE
          WHEN COALESCE(video_metrics.watch_progress_events, 0) > 0
            THEN COALESCE(video_metrics.completion_ratio_sum, 0) / video_metrics.watch_progress_events
          ELSE 0.0
        END AS completion_rate,
        CASE
          WHEN COALESCE(video_metrics.likes, 0) > 0 OR COALESCE(video_metrics.saves, 0) > 0 THEN 0.8
          WHEN COALESCE(video_metrics.watch_progress_events, 0) > 0 THEN 0.5
          ELSE 0.2
        END AS engagement_quality,
        CASE
          WHEN user_video_interactions.not_interested = TRUE THEN 80.0
          WHEN user_video_interactions.has_skipped = TRUE THEN 25.0
          ELSE 0.0
        END AS negative_feedback_penalty,
        CASE
          WHEN viewer_seen.video_id IS NOT NULL THEN 30.0
          ELSE 0.0
        END AS seen_penalty
      FROM videos
      LEFT JOIN video_hashtags ON video_hashtags.video_id = videos.id
      LEFT JOIN hashtags ON hashtags.id = video_hashtags.hashtag_id
      LEFT JOIN video_metrics ON video_metrics.video_id = videos.id
      LEFT JOIN user_video_interactions ON user_video_interactions.user_id = ${session.user.id}
        AND user_video_interactions.video_id = videos.id
      LEFT JOIN viewer_seen ON viewer_seen.video_id = videos.id
      LEFT JOIN creator_window ON creator_window.id = videos.id
      WHERE videos.status = 'ready'
        AND videos.visibility = 'public'
        AND videos.creator_id <> ${session.user.id}
      GROUP BY
        videos.id,
        video_metrics.video_id,
        user_video_interactions.user_id,
        user_video_interactions.video_id,
        creator_window.creator_rank,
        viewer_seen.video_id
      ORDER BY videos.created_at DESC
      LIMIT 200
    `);

    const rankedItems = feedVideos
      .filter((video) => video.candidate_source !== "seen")
      .map((video) => {
        const score = scoreRecommendationCandidate({
          candidateSource: (video.candidate_source as "fresh" | "followed" | "similar" | "topic" | "exploration") ?? "fresh",
          freshnessHours: Number(video.freshness_hours ?? 0),
          creatorAffinity: Number(video.creator_affinity ?? 0),
          topicAffinity: Number(video.topic_affinity ?? 0),
          completionRate: Number(video.completion_rate ?? 0),
          engagementQuality: Number(video.engagement_quality ?? 0),
          negativeFeedbackPenalty: Number(video.negative_feedback_penalty ?? 0),
          seenPenalty: Number(video.seen_penalty ?? 0)
        });

        return {
          id: video.id,
          creatorId: video.creator_id,
          caption: video.caption,
          hashtags: video.hashtags ?? [],
          playbackUrl: video.hls_manifest_key
            ? getPublicMediaUrl(video.hls_manifest_key)
            : null,
          thumbnailUrl: video.thumbnail_key
            ? getPublicMediaUrl(video.thumbnail_key)
            : null,
          createdAt: video.created_at,
          ranking: {
            score,
            candidateSource: video.candidate_source
          }
        };
      })
      .sort((a, b) => b.ranking.score - a.ranking.score)
      .slice(0, query.limit);

    return { items: rankedItems };
  });
}
