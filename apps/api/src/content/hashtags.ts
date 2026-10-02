import { db } from "../db/index.js";
import { hashtags, videoHashtags } from "../db/schema.js";

const hashtagPattern = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,64})/gu;

export function extractHashtags(text: string | null | undefined) {
  if (!text) {
    return [];
  }

  const slugs = new Set<string>();

  for (const match of text.matchAll(hashtagPattern)) {
    const value = match[2]?.normalize("NFKC").toLowerCase();

    if (value) {
      slugs.add(value);
    }
  }

  return [...slugs].slice(0, 20);
}

export async function attachCaptionHashtags(input: {
  videoId: string;
  caption: string | null | undefined;
}) {
  const slugs = extractHashtags(input.caption);

  if (slugs.length === 0) {
    return [];
  }

  const rows = await db
    .insert(hashtags)
    .values(
      slugs.map((slug) => ({
        name: slug,
        slug
      }))
    )
    .onConflictDoUpdate({
      target: hashtags.slug,
      set: {
        name: hashtags.name
      }
    })
    .returning({
      id: hashtags.id,
      slug: hashtags.slug
    });

  await db
    .insert(videoHashtags)
    .values(
      rows.map((hashtag) => ({
        videoId: input.videoId,
        hashtagId: hashtag.id
      }))
    )
    .onConflictDoNothing();

  return rows.map((row) => row.slug);
}
