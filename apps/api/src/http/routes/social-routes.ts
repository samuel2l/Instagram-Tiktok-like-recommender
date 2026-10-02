import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  blocks,
  follows,
  notifications,
  profiles,
  reports,
  user,
  videos
} from "../../db/schema.js";
import { buildNotificationMessage } from "../../social.js";
import { requireSession } from "../session.js";

const followUsernameParams = z.object({ username: z.string().min(1).max(64) });
const blockUserParams = z.object({ id: z.string().min(1) });
const reportInput = z.object({
  targetType: z.enum(["video", "comment", "user", "profile"]),
  targetId: z.string().min(1),
  targetUserId: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export async function registerSocialRoutes(app: FastifyInstance) {
  app.post("/profiles/:username/follow", async (request) => {
    const session = await requireSession(request);
    const params = followUsernameParams.parse(request.params);
    const [targetProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, params.username));

    if (!targetProfile) {
      throw app.httpErrors.notFound("Profile not found");
    }

    if (targetProfile.userId === session.user.id) {
      throw app.httpErrors.badRequest("You cannot follow yourself");
    }

    const [isBlocked] = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.userId, session.user.id),
          eq(blocks.targetUserId, targetProfile.userId)
        )
      );

    if (isBlocked) {
      throw app.httpErrors.forbidden("You cannot follow a blocked user");
    }

    const [existingFollow] = await db
      .insert(follows)
      .values({
        followerId: session.user.id,
        followingId: targetProfile.userId
      })
      .onConflictDoNothing()
      .returning();

    if (!existingFollow) {
      return { following: true, created: false };
    }

    const [actor] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, session.user.id));

    await db.insert(notifications).values({
      userId: targetProfile.userId,
      actorUserId: session.user.id,
      type: "follow",
      entityType: "profile",
      entityId: targetProfile.id,
      message: buildNotificationMessage("follow", actor?.name ?? "Someone"),
      metadata: {
        profileId: targetProfile.id,
        username: targetProfile.username
      }
    });

    return { following: true, created: true };
  });

  app.delete("/profiles/:username/follow", async (request) => {
    const session = await requireSession(request);
    const params = followUsernameParams.parse(request.params);
    const [targetProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, params.username));

    if (!targetProfile) {
      throw app.httpErrors.notFound("Profile not found");
    }

    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, session.user.id),
          eq(follows.followingId, targetProfile.userId)
        )
      );

    return { following: false };
  });

  app.get("/profiles/:username/followers", async (request) => {
    await requireSession(request);
    const params = followUsernameParams.parse(request.params);
    const [targetProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, params.username));

    if (!targetProfile) {
      throw app.httpErrors.notFound("Profile not found");
    }

    const rows = await db
      .select({
        userId: follows.followerId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl
      })
      .from(follows)
      .innerJoin(profiles, eq(profiles.userId, follows.followerId))
      .where(eq(follows.followingId, targetProfile.userId));

    return { items: rows };
  });

  app.get("/profiles/:username/following", async (request) => {
    await requireSession(request);
    const params = followUsernameParams.parse(request.params);
    const [targetProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, params.username));

    if (!targetProfile) {
      throw app.httpErrors.notFound("Profile not found");
    }

    const rows = await db
      .select({
        userId: follows.followingId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl
      })
      .from(follows)
      .innerJoin(profiles, eq(profiles.userId, follows.followingId))
      .where(eq(follows.followerId, targetProfile.userId));

    return { items: rows };
  });

  app.post("/users/:id/block", async (request) => {
    const session = await requireSession(request);
    const params = blockUserParams.parse(request.params);

    if (params.id === session.user.id) {
      throw app.httpErrors.badRequest("You cannot block yourself");
    }

    const [blocked] = await db
      .insert(blocks)
      .values({
        userId: session.user.id,
        targetUserId: params.id
      })
      .onConflictDoNothing()
      .returning();

    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, session.user.id),
          eq(follows.followingId, params.id)
        )
      );

    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, params.id),
          eq(follows.followingId, session.user.id)
        )
      );

    return { blocked: !!blocked || true };
  });

  app.delete("/users/:id/block", async (request) => {
    const session = await requireSession(request);
    const params = blockUserParams.parse(request.params);

    await db
      .delete(blocks)
      .where(
        and(
          eq(blocks.userId, session.user.id),
          eq(blocks.targetUserId, params.id)
        )
      );

    return { blocked: false };
  });

  app.post("/reports", async (request) => {
    const session = await requireSession(request);
    const input = reportInput.parse(request.body);

    if (input.targetType === "video") {
      const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, input.targetId));

      if (!video) {
        throw app.httpErrors.notFound("Video not found");
      }
    }

    if (input.targetType === "profile" || input.targetType === "user") {
      if (!input.targetUserId) {
        throw app.httpErrors.badRequest("targetUserId is required for user reports");
      }

      const [targetUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, input.targetUserId));

      if (!targetUser) {
        throw app.httpErrors.notFound("User not found");
      }
    }

    const [report] = await db
      .insert(reports)
      .values({
        reporterUserId: session.user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUserId: input.targetUserId ?? null,
        reason: input.reason ?? null,
        details: input.details ?? {}
      })
      .returning();

    if (input.targetUserId) {
      const [actor] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, session.user.id));

      await db.insert(notifications).values({
        userId: input.targetUserId,
        actorUserId: session.user.id,
        type: "report",
        entityType: input.targetType,
        entityId: input.targetId,
        message: buildNotificationMessage("report", actor?.name ?? "Someone"),
        metadata: {
          reportId: report.id,
          reason: input.reason ?? "Other"
        }
      });
    }

    return { report };
  });

  app.post("/videos/:id/report", async (request) => {
    const session = await requireSession(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = z
      .object({
        reason: z.string().max(500).optional(),
        details: z.record(z.string(), z.unknown()).optional()
      })
      .parse(request.body);

    const requestBody = {
      targetType: "video" as const,
      targetId: params.id,
      reason: input.reason,
      details: input.details
    };

    return app.inject({
      method: "POST",
      url: "/reports",
      headers: {
        cookie: request.headers.cookie ?? "",
        authorization: request.headers.authorization ?? ""
      },
      payload: requestBody
    }).then(async (response) => {
      if (response.statusCode >= 400) {
        throw app.httpErrors.createError(response.statusCode, response.payload);
      }

      return response.json();
    });
  });

  app.get("/notifications", async (request) => {
    const session = await requireSession(request);
    const query = z
      .object({
        limit: z.coerce.number().min(1).max(100).default(20)
      })
      .parse(request.query);

    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, session.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(query.limit);

    return { items };
  });

  app.patch("/notifications/:id/read", async (request) => {
    const session = await requireSession(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, params.id));

    if (!notification) {
      throw app.httpErrors.notFound("Notification not found");
    }

    if (notification.userId !== session.user.id) {
      throw app.httpErrors.forbidden("Not your notification");
    }

    const [updated] = await db
      .update(notifications)
      .set({
        isRead: true,
        updatedAt: new Date()
      })
      .where(eq(notifications.id, notification.id))
      .returning();

    return { notification: updated };
  });
}
