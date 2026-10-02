import type { FastifyInstance } from "fastify";
import { auth } from "../../auth.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(
        request.url,
        `${request.protocol}://${request.headers.host}`
      );
      const headers = new Headers();

      for (const [key, value] of Object.entries(request.headers)) {
        if (!value) {
          continue;
        }

        headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }

      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : JSON.stringify(request.body ?? {});
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          body
        })
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(Buffer.from(await response.arrayBuffer()));
    }
  });
}
