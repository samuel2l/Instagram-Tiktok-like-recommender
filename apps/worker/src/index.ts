import amqp, { type ChannelModel, type ConsumeMessage } from "amqplib";
import { env } from "./config.js";
import { closeDb } from "./db.js";
import { processWatchEventsMessage } from "./events.js";
import { processUploadedVideo } from "./processor.js";
import { ensureVideoSearchIndex } from "./search.js";

type VideoUploadedEvent = {
  key?: string;
  payload?: {
    type?: string;
    videoId?: string;
  };
};

let connection: ChannelModel | null = null;
let shuttingDown = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMessage(message: ConsumeMessage) {
  const event = JSON.parse(message.content.toString()) as VideoUploadedEvent;
  const videoId = event.payload?.videoId ?? event.key;

  if (!videoId) {
    throw new Error("video.uploaded message is missing videoId");
  }

  return { videoId };
}

async function start() {
  await ensureVideoSearchIndex();

  connection = await amqp.connect(env.RABBITMQ_URL);
  connection.on("error", (error) => {
    console.error("RabbitMQ connection error", error);
  });
  connection.on("close", () => {
    if (!shuttingDown) {
      console.error("RabbitMQ connection closed");
    }
  });
  const channel = await connection.createChannel();

  await channel.assertExchange(env.RABBITMQ_EXCHANGE, "topic", {
    durable: true
  });
  await channel.assertQueue(env.RABBITMQ_VIDEO_QUEUE, {
    durable: true
  });
  await channel.assertQueue(env.RABBITMQ_EVENTS_QUEUE, {
    durable: true
  });
  await channel.bindQueue(
    env.RABBITMQ_VIDEO_QUEUE,
    env.RABBITMQ_EXCHANGE,
    "video.uploaded"
  );
  await channel.bindQueue(
    env.RABBITMQ_EVENTS_QUEUE,
    env.RABBITMQ_EXCHANGE,
    "watch.event"
  );
  channel.prefetch(1);

  console.log(
    `Video worker listening on ${env.RABBITMQ_VIDEO_QUEUE} for video.uploaded`
  );
  console.log(
    `Event worker listening on ${env.RABBITMQ_EVENTS_QUEUE} for watch.event`
  );

  await channel.consume(env.RABBITMQ_VIDEO_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const { videoId } = parseMessage(message);
      console.log(`Processing video ${videoId}`);
      await processUploadedVideo(videoId);
      channel.ack(message);
      console.log(`Processed video ${videoId}`);
    } catch (error) {
      console.error(error);
      channel.nack(message, false, false);
    }
  });

  await channel.consume(env.RABBITMQ_EVENTS_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      await processWatchEventsMessage(message);
      channel.ack(message);
    } catch (error) {
      console.error(error);
      channel.nack(message, false, true);
    }
  });
}

async function shutdown() {
  shuttingDown = true;

  if (connection) {
    await connection.close();
  }

  await closeDb();
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

while (!shuttingDown) {
  try {
    await start();
    break;
  } catch (error) {
    console.error("Worker startup failed; retrying in 5 seconds", error);
    await wait(5000);
  }
}
