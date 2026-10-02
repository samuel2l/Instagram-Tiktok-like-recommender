import { attachCaptionHashtags } from "./hashtags.js";
import { closeDb, db } from "../db/index.js";
import { videos } from "../db/schema.js";

const allVideos = await db
  .select({
    id: videos.id,
    caption: videos.caption
  })
  .from(videos);

let attached = 0;

for (const video of allVideos) {
  const slugs = await attachCaptionHashtags({
    videoId: video.id,
    caption: video.caption
  });
  attached += slugs.length;
}

console.log(`Backfilled ${attached} hashtag links across ${allVideos.length} videos`);

await closeDb();
