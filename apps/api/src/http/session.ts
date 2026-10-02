import type { FastifyRequest } from "fastify";
import { auth } from "../auth.js";

export async function getSession(request: FastifyRequest) {
  return auth.api.getSession({
    headers: new Headers(
      Object.entries(request.headers).flatMap(([key, value]) => {
        if (!value) {
          return [];
        }

        return [[key, Array.isArray(value) ? value.join(",") : value]];
      })
    )
  });
}

export async function requireSession(request: FastifyRequest) {
  const session = await getSession(request);

  if (!session) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return session;
}
