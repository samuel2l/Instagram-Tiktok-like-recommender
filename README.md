# Reels Recommender

A production-shaped short-video platform inspired by TikTok/Reels.

This repo is intentionally structured around the hard parts of a reel system:

- video upload and processing
- adaptive HLS playback
- event tracking
- recommendation features
- search and semantic similarity

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for the full product and architecture plan.

## Current Slice

The first implementation slice contains:

- Node/Fastify REST API
- Better Auth wiring
- Neon Postgres + Drizzle schema
- pgvector-ready video feature table
- Cloudflare R2 upload URL service
- RabbitMQ event publisher
- FFmpeg video processing worker
- initial profile, video, feed, and event routes

## Cloud Services

This app is built to run the API locally while using managed cloud services:

- Neon Postgres with pgvector
- Redis Cloud
- CloudAMQP/RabbitMQ
- Cloudflare R2
- Elastic Cloud

## Environment

Copy the example env:

```bash
cp .env.example .env
```

Generate a Better Auth secret:

```bash
openssl rand -base64 32
```

Set `BETTER_AUTH_SECRET` in `.env`.

## API

Install dependencies:

```bash
npm install
```

Push the database schema:

```bash
npm run db:setup
npm run db:push
```

Run the API:

```bash
npm run dev:api
```

Run the video worker in a second terminal:

```bash
npm run dev:worker
```

The worker requires `ffmpeg` and `ffprobe` on your machine. It consumes
`video.uploaded` from RabbitMQ, downloads the raw upload from the private R2
bucket, creates adaptive HLS outputs plus a thumbnail, uploads them to the
processed R2 bucket, and marks the video `ready`.

API health:

```txt
GET http://localhost:4000/health
```

Swagger UI:

```txt
http://localhost:4000/docs
```

Dev upload page:

```txt
http://localhost:4000/dev/upload
```

Use it after signing in through Better Auth. It requests a presigned R2 upload
URL, uploads the selected video directly to R2, calls upload complete, then links
to a playback/status page.

Your `reels-raw` R2 bucket needs CORS that allows browser `PUT` uploads from the
local API origin:

```json
[
  {
    "AllowedOrigins": ["http://localhost:4000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Core Routes

Auth:

```txt
/api/auth/*
```

Profiles:

```txt
GET /profiles/me
PUT /profiles/me
GET /profiles/:username
```

Videos:

```txt
POST /videos/upload-url
POST /videos/:id/upload-complete
GET /videos/:id
GET /videos/:id/processing-status
GET /feed
```

Events:

```txt
POST /events
```

The event pipeline stores raw behavior first, then aggregates it asynchronously:

```txt
API validates event batch
  ↓
API writes raw events to watch_events
  ↓
API publishes watch.event to RabbitMQ
  ↓
Worker updates video_metrics and user_video_interactions
  ↓
/feed ranks videos from aggregate features
```

Search:

```txt
GET /search/videos?q=caption-or-tag
```

Captions are parsed for hashtags during upload. Existing videos can be backfilled:

```bash
npm run hashtags:backfill
```

## Video Upload Flow

The target flow is:

```txt
Flutter asks API for upload URL
  ↓
API creates video row with status = uploading
  ↓
API returns Cloudflare R2 presigned PUT URL
  ↓
Flutter uploads raw video directly to object storage
  ↓
Flutter calls /videos/:id/upload-complete
  ↓
API marks video processing and publishes video.uploaded to RabbitMQ
  ↓
FFmpeg worker transcodes to HLS
  ↓
Worker marks video ready
  ↓
Worker indexes ready public video in Elasticsearch
```
