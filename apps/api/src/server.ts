import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";

const { env } = await import("./config.js");
const { closeDb } = await import("./db/index.js");
const { disconnectEventProducer } = await import("./events/producer.js");
const { registerAuthRoutes } = await import("./http/routes/auth-routes.js");
const { registerEventRoutes } = await import("./http/routes/event-routes.js");
const { registerDevRoutes } = await import("./http/routes/dev-routes.js");
const { registerProfileRoutes } = await import("./http/routes/profile-routes.js");
const { registerSearchRoutes } = await import("./http/routes/search-routes.js");
const { registerSocialRoutes } = await import("./http/routes/social-routes.js");
const { registerVideoRoutes } = await import("./http/routes/video-routes.js");
const { ensureVideoSearchIndex } = await import("./search/video-index.js");

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true,
  credentials: true
});
await app.register(sensible);
await app.register(swagger, {
  openapi: {
    info: {
      title: "Reels Recommender API",
      version: "0.1.0"
    }
  }
});
await app.register(swaggerUi, {
  routePrefix: "/docs"
});

app.get("/health", async () => ({ ok: true }));

await ensureVideoSearchIndex();
await registerAuthRoutes(app);
await registerProfileRoutes(app);
await registerSocialRoutes(app);
await registerVideoRoutes(app);
await registerEventRoutes(app);
await registerSearchRoutes(app);
await registerDevRoutes(app);

const close = async () => {
  await app.close();
  await disconnectEventProducer();
  await closeDb();
};

process.on("SIGINT", () => void close().finally(() => process.exit(0)));
process.on("SIGTERM", () => void close().finally(() => process.exit(0)));

await app.listen({
  port: env.API_PORT,
  host: "0.0.0.0"
});
