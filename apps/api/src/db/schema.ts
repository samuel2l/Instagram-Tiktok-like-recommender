import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector
} from "drizzle-orm/pg-core";

export const videoStatus = pgEnum("video_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
  "blocked"
]);

export const videoVisibility = pgEnum("video_visibility", [
  "public",
  "private",
  "unlisted"
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("profiles_user_id_idx").on(table.userId),
    uniqueIndex("profiles_username_idx").on(table.username)
  ]
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    caption: text("caption"),
    status: videoStatus("status").default("uploading").notNull(),
    visibility: videoVisibility("visibility").default("public").notNull(),
    rawObjectKey: text("raw_object_key"),
    hlsManifestKey: text("hls_manifest_key"),
    thumbnailKey: text("thumbnail_key"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [
    index("videos_creator_id_idx").on(table.creatorId),
    index("videos_status_created_at_idx").on(table.status, table.createdAt)
  ]
);

export const hashtags = pgTable(
  "hashtags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [uniqueIndex("hashtags_slug_idx").on(table.slug)]
);

export const videoHashtags = pgTable(
  "video_hashtags",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    hashtagId: uuid("hashtag_id")
      .notNull()
      .references(() => hashtags.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.videoId, table.hashtagId] })]
);

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followingId] })]
);

export const blocks = pgTable(
  "blocks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.targetUserId] })]
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetUserId: text("target_user_id"),
    reason: text("reason"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text("status").default("open").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at")
  },
  (table) => [index("reports_target_type_target_id_idx").on(table.targetType, table.targetId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    message: text("message").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [index("notifications_user_created_at_idx").on(table.userId, table.createdAt)]
);

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.videoId] })]
);

export const saves = pgTable(
  "saves",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.videoId] })]
);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const watchEvents = pgTable(
  "watch_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    watchMs: integer("watch_ms"),
    durationMs: integer("duration_ms"),
    clientEventId: text("client_event_id"),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    index("watch_events_video_created_idx").on(table.videoId, table.createdAt),
    index("watch_events_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("watch_events_client_event_user_idx")
      .on(table.clientEventId, table.userId)
      .where(sql`${table.clientEventId} IS NOT NULL AND ${table.userId} IS NOT NULL`)
  ]
);

export const videoMetrics = pgTable("video_metrics", {
  videoId: uuid("video_id")
    .primaryKey()
    .references(() => videos.id, { onDelete: "cascade" }),
  impressions: integer("impressions").default(0).notNull(),
  playStarts: integer("play_starts").default(0).notNull(),
  watchProgressEvents: integer("watch_progress_events").default(0).notNull(),
  completes: integer("completes").default(0).notNull(),
  skips: integer("skips").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  saves: integer("saves").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  reports: integer("reports").default(0).notNull(),
  totalWatchMs: integer("total_watch_ms").default(0).notNull(),
  completionRatioSum: doublePrecision("completion_ratio_sum").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const userVideoInteractions = pgTable(
  "user_video_interactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    hasImpressed: boolean("has_impressed").default(false).notNull(),
    hasPlayed: boolean("has_played").default(false).notNull(),
    hasCompleted: boolean("has_completed").default(false).notNull(),
    hasSkipped: boolean("has_skipped").default(false).notNull(),
    liked: boolean("liked").default(false).notNull(),
    saved: boolean("saved").default(false).notNull(),
    notInterested: boolean("not_interested").default(false).notNull(),
    maxWatchMs: integer("max_watch_ms").default(0).notNull(),
    durationMs: integer("duration_ms"),
    maxCompletionRatio: doublePrecision("max_completion_ratio").default(0).notNull(),
    lastEventAt: timestamp("last_event_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.videoId] }),
    index("user_video_interactions_user_recent_idx").on(
      table.userId,
      table.lastEventAt
    )
  ]
);

export const videoFeatures = pgTable("video_features", {
  videoId: uuid("video_id")
    .primaryKey()
    .references(() => videos.id, { onDelete: "cascade" }),
  transcript: text("transcript"),
  ocrText: text("ocr_text"),
  topics: text("topics").array(),
  textEmbedding: vector("text_embedding", { dimensions: 384 }),
  visualEmbedding: vector("visual_embedding", { dimensions: 384 }),
  combinedEmbedding: vector("combined_embedding", { dimensions: 384 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, {
    fields: [profiles.userId],
    references: [user.id]
  })
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  creator: one(user, {
    fields: [videos.creatorId],
    references: [user.id]
  }),
  likes: many(likes),
  comments: many(comments),
  saves: many(saves)
}));
