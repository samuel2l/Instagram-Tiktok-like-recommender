import type { ConsumeMessage } from "amqplib";
import { applyWatchEventAggregates, type WatchEventRecord } from "./db.js";

type WatchEventMessage = {
  payload?: {
    events?: Array<{
      id?: string;
      userId?: string | null;
      videoId?: string;
      eventType?: string;
      watchMs?: number | null;
      durationMs?: number | null;
      createdAt?: string | Date;
    }>;
  };
};

export function parseWatchEventsMessage(message: ConsumeMessage) {
  const parsed = JSON.parse(message.content.toString()) as WatchEventMessage;
  const events = parsed.payload?.events ?? [];

  return events.flatMap<WatchEventRecord>((event) => {
    if (!event.id || !event.videoId || !event.eventType || !event.createdAt) {
      return [];
    }

    return [
      {
        id: event.id,
        userId: event.userId ?? null,
        videoId: event.videoId,
        eventType: event.eventType,
        watchMs: event.watchMs ?? null,
        durationMs: event.durationMs ?? null,
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : event.createdAt
      }
    ];
  });
}

export async function processWatchEventsMessage(message: ConsumeMessage) {
  const events = parseWatchEventsMessage(message);

  if (events.length === 0) {
    return;
  }

  await applyWatchEventAggregates(events);
}
