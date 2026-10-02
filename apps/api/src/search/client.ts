import { Client } from "@elastic/elasticsearch";
import { env } from "../config.js";

export const elasticsearch = new Client({
  node: env.ELASTICSEARCH_NODE,
  auth: {
    apiKey: env.ELASTICSEARCH_API_KEY
  }
});

export const videoIndexName = env.ELASTICSEARCH_INDEX_VIDEOS;
