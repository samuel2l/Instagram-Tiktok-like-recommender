import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import { requireSession } from "../session.js";

const profileInput = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  bio: z.string().max(240).optional(),
  avatarUrl: z.string().url().optional()
});

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/profiles/me", async (request) => {
    const session = await requireSession(request);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, session.user.id));

    return { profile: profile ?? null };
  });

  app.put("/profiles/me", async (request) => {
    const session = await requireSession(request);
    const input = profileInput.parse(request.body);
    const [existingProfile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id));

    if (existingProfile) {
      const [profile] = await db
        .update(profiles)
        .set({
          ...input,
          bio: input.bio ?? null,
          avatarUrl: input.avatarUrl ?? null,
          updatedAt: new Date()
        })
        .where(eq(profiles.id, existingProfile.id))
        .returning();

      return { profile };
    }

    const [profile] = await db
      .insert(profiles)
      .values({
        userId: session.user.id,
        username: input.username,
        displayName: input.displayName,
        bio: input.bio ?? null,
        avatarUrl: input.avatarUrl ?? null
      })
      .returning();

    return { profile };
  });

  app.get("/profiles/:username", async (request) => {
    const params = z.object({ username: z.string() }).parse(request.params);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, params.username));

    if (!profile) {
      throw app.httpErrors.notFound("Profile not found");
    }

    return { profile };
  });
}
