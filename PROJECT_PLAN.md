# Reels Recommender Project Plan

This document describes the intended architecture and build plan for a production-shaped short-video app similar to TikTok or Instagram Reels. It is meant to make the project resumable if work stops midstream.

## Product Goal

Build a mobile-first short-video platform where every user can watch, post, interact, and see growth/analytics for their own content.

The core product loop is:

```txt
show video -> capture behavior -> learn preferences -> rank better videos
```

The hard part is not basic video playback. The hard part is the feedback loop: collecting high-quality watch/engagement events and using them to improve the next feed response.

## Chosen Stack

Mobile:

```txt
Flutter
```

Backend:

```txt
NestJS or Fastify
REST API first
Better Auth
```

Data:

```txt
Neon Postgres
pgvector
Redis Cloud
```

Search:

```txt
Elastic Cloud
```

Events:

```txt
RabbitMQ
```

Video:

```txt
Cloudflare R2 for raw uploads and processed HLS files
R2 public development URL for delivery during local development
FFmpeg workers for transcoding
```

AI/content understanding:

```txt
Whisper or faster-whisper for transcription
OCR with Tesseract or PaddleOCR
CLIP/SigLIP for visual embeddings
Text embeddings with sentence-transformers or similar
```

Analytics:

```txt
ClickHouse later, once event volume justifies it
```

## Cloud Services Strategy

Use managed cloud services with useful free tiers or generous development limits:

```txt
Neon Postgres
Redis Cloud
CloudAMQP/RabbitMQ
Cloudflare R2
Elastic Cloud
```

Avoid expensive managed services that hide the core learning path:

```txt
MediaConvert -> replace with FFmpeg worker
MSK -> replace with RabbitMQ on CloudAMQP
Transcribe -> replace with Whisper/faster-whisper
Rekognition -> replace with OCR/CLIP/moderation models
NAT Gateway -> avoid early
```

## API Style

Use REST first.

GraphQL is not needed initially because the core interactions map cleanly to REST:

```txt
GET /feed
POST /videos/upload-url
POST /events
POST /videos/:id/like
GET /videos/:id/comments
POST /videos/:id/comments
GET /profiles/:username
GET /search
```

GraphQL can be reconsidered later for admin dashboards or complex analytics views, but it should not be part of the core feed path at the start.

## Identity Model

Do not create a separate creator profile model.

Every user has one profile, and every profile can post content and see analytics for their own content.

```txt
Profile = viewer identity + creator identity
```

Suggested tables:

```txt
users
profiles
videos
follows
likes
comments
saves
shares
watch_events
video_analytics
notifications
reports
```

Analytics are shown only to the owner of a profile/video.

## Core Features

User features:

```txt
sign up / sign in
edit profile
vertical swipe feed
autoplay video
like
comment
reply
save/bookmark
share
follow/unfollow
profile pages
hashtags
sounds/audio pages
search
notifications
watch history
not interested
report
block user
```

Posting features:

```txt
video upload
caption
hashtags
sound/audio metadata
thumbnail generation
drafts later
scheduled publishing later
visibility settings
```

Analytics features:

```txt
views
unique viewers
watch time
average watch duration
completion rate
rewatch rate
likes
comments
shares
saves
follower growth
retention curve later
```

Moderation features:

```txt
report video
report comment
not interested
blocked users
automated content labels
admin review queue
rate limiting
spam prevention
```

## Video Pipeline

Target upload and processing flow:

```txt
Flutter requests upload URL
  ↓
Backend creates video row with status = uploading
  ↓
Backend returns S3 presigned upload URL
  ↓
Flutter uploads raw video directly to S3
  ↓
S3/EventBridge/Lambda or the backend emits video.uploaded
  ↓
RabbitMQ routes job to the video processing queue
  ↓
FFmpeg worker downloads raw source
  ↓
FFmpeg creates adaptive HLS renditions and thumbnail
  ↓
Worker uploads HLS files + thumbnail back to S3
  ↓
CloudFront serves HLS and thumbnails
  ↓
DB status becomes ready
  ↓
Video enters recommendation pool
```

Video statuses:

```txt
uploading
processing
ready
failed
blocked
```

Only `ready` videos should appear in public feeds.

## Adaptive Bitrate Streaming

The FFmpeg worker should create multiple HLS renditions:

```txt
1080p
720p
480p
360p
```

Output shape:

```txt
master.m3u8
1080p/index.m3u8
720p/index.m3u8
480p/index.m3u8
360p/index.m3u8
segments...
```

Flutter plays the HLS master playlist. The player chooses the best bitrate and can switch quality when network conditions change.

## Event Tracking

The event system is a first-class product requirement.

Client events:

```txt
video_impression
play_start
watch_progress
complete
rewatch
skip
like
unlike
comment
share
save
unsave
follow
unfollow
not_interested
report
profile_click
hashtag_click
sound_click
```

Event flow:

```txt
Flutter sends event batch
  ↓
Backend validates auth and payload
  ↓
Backend publishes event to RabbitMQ
  ↓
Workers aggregate user/video features
  ↓
Postgres stores current feature state
  ↓
Recommendation service uses features for ranking
```

RabbitMQ exchange and routing keys:

```txt
exchange: reels.events

routing keys:
watch.event
engagement.event
video.uploaded
video.processing.completed
search.index
notification.send
moderation.review

queues:
video-processing.queue
recommendation-events.queue
search-index.queue
notifications.queue
moderation.queue
```

## Recommendation System

Start with a strong deterministic ranking system, then evolve into ML-assisted ranking.

Candidate sources:

```txt
fresh ready videos
popular videos
videos from followed profiles
videos similar to liked/completed videos
same hashtags/sounds/topics
pgvector semantic candidates
exploration candidates
```

Ranking signals:

```txt
watch completion
expected watch time
rewatch rate
like rate
comment rate
share rate
save rate
creator affinity
topic/hashtag match
freshness
semantic similarity
negative feedback
report risk
seen penalty
diversity controls
```

Basic score shape:

```txt
score =
  watch_quality
  + engagement_quality
  + creator_affinity
  + topic_match
  + freshness
  + exploration_boost
  - seen_penalty
  - negative_feedback_penalty
  - safety_penalty
```

Re-ranking rules:

```txt
avoid repeating same creator too often
avoid repeating same topic too often
remove already seen videos
respect blocked users
respect not-interested feedback
mix familiar and exploratory content
```

## Content Understanding

After a video becomes ready:

```txt
extract audio with FFmpeg
  ↓
transcribe with Whisper/faster-whisper
  ↓
sample video frames
  ↓
run OCR on selected frames
  ↓
generate text embeddings from caption + transcript + OCR
  ↓
generate visual embeddings from sampled frames
  ↓
store embeddings in pgvector
  ↓
index searchable text in Elasticsearch
```

This powers:

```txt
semantic search
similar videos
topic inference
recommendation candidates
moderation hints
```

## Search

Use Elasticsearch for keyword-style search:

```txt
captions
hashtags
profiles
sounds
transcripts
OCR text
```

Use pgvector for semantic similarity:

```txt
more like this
interest matching
embedding-based candidate generation
```

## Initial Build Phases

Phase 1: Foundation

```txt
backend app scaffold
Better Auth
Postgres schema
profiles
basic REST API
Flutter app scaffold
```

Phase 2: Video System

```txt
Cloudflare R2 presigned upload
video rows and statuses
FFmpeg worker
HLS output
R2 public playback URL
Flutter vertical video player
```

Phase 3: Social Features

```txt
likes
comments
replies
saves
follows
shares
profile pages
```

Phase 4: Event Pipeline

```txt
RabbitMQ
event ingestion endpoint
batched Flutter event sending
watch events
engagement events
feature aggregation workers
```

Phase 5: Feed V1

```txt
ready videos only
seen suppression
freshness
popularity
tag/hashtag matching
simple exploration
```

Phase 6: Search and Discovery

```txt
Elasticsearch indexing
hashtag pages
sound pages
creator search
video search
```

Phase 7: Content Understanding

```txt
Whisper transcription
OCR
text embeddings
visual embeddings
pgvector storage
semantic candidates
```

Phase 8: Feed V2

```txt
multi-source candidate generation
semantic recommendations
collaborative filtering
diversity re-ranking
negative feedback handling
```

Phase 9: Safety and Moderation

```txt
reports
blocked users
not interested
admin review queue
automated labels
rate limits
spam controls
```

Phase 10: Analytics

```txt
creator analytics
retention metrics
completion metrics
growth metrics
recommendation metrics
ClickHouse if needed
```

## Important Product Rules

- Public feeds should only show videos with `status = ready`.
- Upload complete does not mean playable; transcoding must finish first.
- The feed should avoid repeating the same creator or topic too often.
- Raw internal IDs and processing states should not leak into normal user UI.
- Every recommendation response should be explainable in logs: candidate source, score, and main ranking factors.
- Watch events should be batched on mobile to avoid noisy network usage.
- Store raw events before deriving features so ranking can be improved later.

## Open Decisions

These should be decided before implementation:

```txt
Backend framework: NestJS or Fastify
Search engine: Elastic Cloud
Queue runtime: RabbitMQ
Flutter player package: video_player, better_player, or media_kit
Deployment target for backend/workers
```

Recommended defaults:

```txt
Backend: Fastify
Search: Elastic Cloud
Queue: RabbitMQ
Flutter player: media_kit or better_player, evaluate with HLS
Storage: Cloudflare R2
```
