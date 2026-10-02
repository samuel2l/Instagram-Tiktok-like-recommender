import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { env } from "../config.js";

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

export async function getEventChannel() {
  if (channel) {
    return channel;
  }

  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createConfirmChannel();
  await channel.assertExchange(env.RABBITMQ_EXCHANGE, "topic", {
    durable: true
  });

  return channel;
}

export async function publishEvent(
  routingKey: string,
  key: string,
  payload: unknown
) {
  const activeChannel = await getEventChannel();
  const body = Buffer.from(
    JSON.stringify({
      key,
      payload,
      publishedAt: new Date().toISOString()
    })
  );

  activeChannel.publish(env.RABBITMQ_EXCHANGE, routingKey, body, {
    contentType: "application/json",
    persistent: true,
    messageId: key,
    timestamp: Date.now()
  });
  await activeChannel.waitForConfirms();
}

export async function disconnectEventProducer() {
  if (channel) {
    await channel.close();
    channel = null;
  }

  if (connection) {
    await connection.close();
    connection = null;
  }
}
