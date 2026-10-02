import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { likes, saves, watchEvents } from "../../db/schema.js";
import { publishEvent } from "../../events/producer.js";
import { getSession } from "../session.js";

const eventType = z.enum([
  "impression",
  "play_start",
  "watch_progress",
  "complete",
  "skip",
  "like",
  "unlike",
  "save",
  "unsave",
  "share",
  "not_interested",
  "report"
]);

const eventInput = z.object({
  events: z
    .array(
      z.object({
        videoId: z.string().uuid(),
        eventType,
        watchMs: z.number().int().nonnegative().optional(),
        durationMs: z.number().int().positive().optional(),
        clientEventId: z.string().max(120).optional(),
        properties: z.record(z.string(), z.unknown()).optional()
      })
    )
    .min(1)
    .max(100)
});

export async function registerEventRoutes(app: FastifyInstance) {
  app.post("/events", async (request) => {
    const session = await getSession(request);
    const input = eventInput.parse(request.body);
    const seenClientEventIds = new Set<string>();
    const events = input.events.filter((event) => {
      if (!event.clientEventId) {
        return true;
      }

      const key = `${session?.user.id ?? "anonymous"}:${event.clientEventId}`;

      if (seenClientEventIds.has(key)) {
        return false;
      }

      seenClientEventIds.add(key);
      return true;
    });
    const rows = await db
      .insert(watchEvents)
      .values(
        events.map((event) => ({
          userId: session?.user.id ?? null,
          videoId: event.videoId,
          eventType: event.eventType,
          watchMs: event.watchMs ?? null,
          durationMs: event.durationMs ?? null,
          clientEventId: event.clientEventId ?? null,
          properties: event.properties ?? {}
        }))
      )
      .onConflictDoNothing()
      .returning();

    if (session) {
      for (const event of rows) {
        if (event.eventType === "like") {
          await db
            .insert(likes)
            .values({ userId: session.user.id, videoId: event.videoId })
            .onConflictDoNothing();
        }

        if (event.eventType === "unlike") {
          await db
            .delete(likes)
            .where(
              and(
                eq(likes.userId, session.user.id),
                eq(likes.videoId, event.videoId)
              )
            );
        }

        if (event.eventType === "save") {
          await db
            .insert(saves)
            .values({ userId: session.user.id, videoId: event.videoId })
            .onConflictDoNothing();
        }

        if (event.eventType === "unsave") {
          await db
            .delete(saves)
            .where(
              and(
                eq(saves.userId, session.user.id),
                eq(saves.videoId, event.videoId)
              )
            );
        }
      }
    }

    await publishEvent("watch.event", session?.user.id ?? "anonymous", {
      events: rows,
      receivedAt: new Date().toISOString()
    });

    return { accepted: rows.length, deduped: input.events.length - rows.length };
  });
}
