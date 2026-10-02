import postgres from "postgres";
import type { JSONValue } from "postgres";
import { env } from "./config.js";

export type VideoRecord = {
  id: string;
  creator_id: string;
  raw_object_key: string | null;
};

export type ReadyVideoSearchRecord = {
  video_id: string;
  creator_id: string;
  caption: string | null;
  hashtags: string[] | null;
  transcript: string | null;
  ocr_text: string | null;
  hls_manifest_key: string | null;
  thumbnail_key: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: Date;
  ready_at: Date;
};

export type WatchEventRecord = {
  id: string;
  userId: string | null;
  videoId: string;
  eventType: string;
  watchMs: number | null;
  durationMs: number | null;
  createdAt: string;
};

export const db = postgres(env.DATABASE_URL, { prepare: false });

export async function getVideo(videoId: string) {
  const rows = await db<VideoRecord[]>`
    SELECT id, creator_id, raw_object_key
    FROM videos
    WHERE id = ${videoId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function markVideoProcessing(videoId: string) {
  await db`
    UPDATE videos
    SET status = 'processing', updated_at = NOW()
    WHERE id = ${videoId}
  `;
}

export async function markVideoReady(input: {
  videoId: string;
  hlsManifestKey: string;
  thumbnailKey: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  metadata: JSONValue;
}) {
  await db`
    UPDATE videos
    SET
      status = 'ready',
      hls_manifest_key = ${input.hlsManifestKey},
      thumbnail_key = ${input.thumbnailKey},
      duration_ms = ${input.durationMs},
      width = ${input.width},
      height = ${input.height},
      metadata = metadata || ${db.json(input.metadata)},
      updated_at = NOW()
    WHERE id = ${input.videoId}
  `;
}

export async function markVideoFailed(input: {
  videoId: string;
  reason: string;
}) {
  await db`
    UPDATE videos
    SET
      status = 'failed',
      metadata = metadata || ${db.json({
        processingError: input.reason,
        failedAt: new Date().toISOString()
      })},
      updated_at = NOW()
    WHERE id = ${input.videoId}
  `;
}

export async function getReadyVideoSearchRecord(videoId: string) {
  const rows = await db<ReadyVideoSearchRecord[]>`
    SELECT
      videos.id AS video_id,
      videos.creator_id,
      videos.caption,
      COALESCE(array_agg(hashtags.slug) FILTER (WHERE hashtags.slug IS NOT NULL), '{}') AS hashtags,
      video_features.transcript,
      video_features.ocr_text,
      videos.hls_manifest_key,
      videos.thumbnail_key,
      videos.duration_ms,
      videos.width,
      videos.height,
      videos.created_at,
      videos.updated_at AS ready_at
    FROM videos
    LEFT JOIN video_hashtags ON video_hashtags.video_id = videos.id
    LEFT JOIN hashtags ON hashtags.id = video_hashtags.hashtag_id
    LEFT JOIN video_features ON video_features.video_id = videos.id
    WHERE videos.id = ${videoId}
      AND videos.status = 'ready'
      AND videos.visibility = 'public'
    GROUP BY videos.id, video_features.video_id
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function applyWatchEventAggregates(events: WatchEventRecord[]) {
  for (const event of events) {
    const completionRatio =
      event.durationMs && event.durationMs > 0 && event.watchMs !== null
        ? Math.min(event.watchMs / event.durationMs, 1)
        : 0;

    await db`
      INSERT INTO video_metrics (
        video_id,
        impressions,
        play_starts,
        watch_progress_events,
        completes,
        skips,
        likes,
        saves,
        shares,
        reports,
        total_watch_ms,
        completion_ratio_sum,
        updated_at
      )
      VALUES (
        ${event.videoId},
        ${event.eventType === "impression" ? 1 : 0},
        ${event.eventType === "play_start" ? 1 : 0},
        ${event.eventType === "watch_progress" ? 1 : 0},
        ${event.eventType === "complete" ? 1 : 0},
        ${event.eventType === "skip" ? 1 : 0},
        ${event.eventType === "like" ? 1 : 0},
        ${event.eventType === "save" ? 1 : 0},
        ${event.eventType === "share" ? 1 : 0},
        ${event.eventType === "report" ? 1 : 0},
        ${event.watchMs ?? 0},
        ${event.eventType === "watch_progress" ? completionRatio : 0},
        NOW()
      )
      ON CONFLICT (video_id)
      DO UPDATE SET
        impressions = video_metrics.impressions + EXCLUDED.impressions,
        play_starts = video_metrics.play_starts + EXCLUDED.play_starts,
        watch_progress_events = video_metrics.watch_progress_events + EXCLUDED.watch_progress_events,
        completes = video_metrics.completes + EXCLUDED.completes,
        skips = video_metrics.skips + EXCLUDED.skips,
        likes = GREATEST(video_metrics.likes + EXCLUDED.likes - ${event.eventType === "unlike" ? 1 : 0}, 0),
        saves = GREATEST(video_metrics.saves + EXCLUDED.saves - ${event.eventType === "unsave" ? 1 : 0}, 0),
        shares = video_metrics.shares + EXCLUDED.shares,
        reports = video_metrics.reports + EXCLUDED.reports,
        total_watch_ms = video_metrics.total_watch_ms + EXCLUDED.total_watch_ms,
        completion_ratio_sum = video_metrics.completion_ratio_sum + EXCLUDED.completion_ratio_sum,
        updated_at = NOW()
    `;

    if (!event.userId) {
      continue;
    }

    await db`
      INSERT INTO user_video_interactions (
        user_id,
        video_id,
        has_impressed,
        has_played,
        has_completed,
        has_skipped,
        liked,
        saved,
        not_interested,
        max_watch_ms,
        duration_ms,
        max_completion_ratio,
        last_event_at,
        updated_at
      )
      VALUES (
        ${event.userId},
        ${event.videoId},
        ${event.eventType === "impression"},
        ${event.eventType === "play_start"},
        ${event.eventType === "complete"},
        ${event.eventType === "skip"},
        ${event.eventType === "like"},
        ${event.eventType === "save"},
        ${event.eventType === "not_interested"},
        ${event.watchMs ?? 0},
        ${event.durationMs},
        ${completionRatio},
        ${event.createdAt},
        NOW()
      )
      ON CONFLICT (user_id, video_id)
      DO UPDATE SET
        has_impressed = user_video_interactions.has_impressed OR EXCLUDED.has_impressed,
        has_played = user_video_interactions.has_played OR EXCLUDED.has_played,
        has_completed = user_video_interactions.has_completed OR EXCLUDED.has_completed,
        has_skipped = user_video_interactions.has_skipped OR EXCLUDED.has_skipped,
        liked = CASE
          WHEN ${event.eventType} = 'like' THEN TRUE
          WHEN ${event.eventType} = 'unlike' THEN FALSE
          ELSE user_video_interactions.liked
        END,
        saved = CASE
          WHEN ${event.eventType} = 'save' THEN TRUE
          WHEN ${event.eventType} = 'unsave' THEN FALSE
          ELSE user_video_interactions.saved
        END,
        not_interested = user_video_interactions.not_interested OR EXCLUDED.not_interested,
        max_watch_ms = GREATEST(user_video_interactions.max_watch_ms, EXCLUDED.max_watch_ms),
        duration_ms = COALESCE(EXCLUDED.duration_ms, user_video_interactions.duration_ms),
        max_completion_ratio = GREATEST(user_video_interactions.max_completion_ratio, EXCLUDED.max_completion_ratio),
        last_event_at = GREATEST(user_video_interactions.last_event_at, EXCLUDED.last_event_at),
        updated_at = NOW()
    `;
  }
}

export async function closeDb() {
  await db.end();
}
