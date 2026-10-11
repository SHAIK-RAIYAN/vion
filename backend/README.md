# Vion — Media Storage and Infrastructure Foundation

Modern video streaming backend for Vion built with **Bun**, **Express 5**, **TypeScript**, **Prisma ORM 8 RC** (contract-based data layer), **Neon PostgreSQL**, **Supabase Storage**, and **Redis + BullMQ**.

---

## 🏛️ Infrastructure Architecture & Roles

Vion separates concerns across three dedicated infrastructure services:

```
┌────────────────────────────────────────────────────────────────────────┐
│                                CLIENT                                  │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ Direct Upload                 │ API Requests
                │ (Signed PUT URL)              │
                ▼                               ▼
    ┌──────────────────────┐        ┌──────────────────────┐
    │   SUPABASE STORAGE   │        │     EXPRESS 5 API    │
    │    (Object Store)    │        │      (Bun Runtime)   │
    └──────────▲───────────┘        └──────────┬───────────┘
               │                               │
               │ Download / Upload             │ Enqueue Transcode Job
               │                               ▼
    ┌──────────┴───────────┐        ┌──────────────────────┐
    │  TRANSCODING WORKER  │◄───────┤     REDIS / BULLMQ   │
    │     (Background)     │ Fetch  │      (Job Queue)     │
    └──────────┬───────────┘        └──────────────────────┘
               │
               │ Update Status & Resolutions
               ▼
    ┌──────────────────────┐
    │   NEON POSTGRESQL    │
    │  (Relational Data)   │
    └──────────────────────┘
```

### 1. Neon Managed PostgreSQL (`DATABASE_URL`)
- **Role**: **Application metadata storage**.
- **What it stores**: Users, Channels, Upload metadata, Processing statuses (`PENDING`, `UPLOADING`, `TRANSCODING`, `COMPLETED`, `FAILED`), Playback URLs, Video Rendition records (1080p, 720p, etc.), Likes/Dislikes, Comments, and Watch History.
- **Access**: Strictly accessed via Prisma ORM 8 RC contract-driven client on the backend. Never exposed directly to clients or logged with connection credentials.

### 2. Supabase Storage (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- **Role**: **Media object store**.
- **What it stores**:
  - `raw-videos` (Private): Raw user uploads direct from client via short-lived signed upload URLs. No public read access.
  - `processed-videos` (Public): Adaptive bitrate HLS streaming assets (master manifests `master.m3u8`, variant playlists, `.ts` chunks).
  - `thumbnails` (Public): Upload posters and channel artwork.
- **Path Layout**: Enforces server-generated paths preventing arbitrary keys or directory traversal:
  - Raw Ingest: `raw/${channelId}/${uploadId}/${uuid}_${safeFilename}`
  - HLS Master: `processed/${channelId}/${videoId}/hls/master.m3u8`
  - Thumbnails: `thumbnails/${channelId}/${videoId}/${uuid}_${safeFilename}`

### 3. Redis & BullMQ (`REDIS_URL`)
- **Role**: **Background job queue and worker messaging**.
- **What it stores**: Transcoding task payloads, retry states, worker concurrency coordination, and queue events.
- **Isolation**: Keeps heavy video transcoding computation off the Express API thread.
- **Local Dev**: Run via Docker Compose (`redis:7-alpine`).

---

## 🎥 Video Upload Lifecycle & Architectural Concepts

### Why the browser uploads directly to storage
Video files typically range from tens of megabytes to several gigabytes. If clients streamed full video payloads through Express, Node/Bun event loops would saturate network bandwidth, tie up HTTP worker threads, and exhaust memory buffers. By having Express generate a cryptographically signed upload capability, the client transmits raw video bytes directly to Supabase Storage. The API stays lightweight and highly available.

### Why signed upload URLs expire
Signed URLs contain a short-lived HMAC permission signature (defaulting to 1 hour). Expiry prevents token harvesting, replay attacks, unauthorized uploads long after a session has lapsed, and accidental writes to stale keys.

### Why `finalize` must verify the stored object
Clients operate in an untrusted environment. A malicious client could:
1. Signal upload completion without ever transferring a file.
2. Upload a 0-byte payload or empty dummy bytes.
3. Exceed declared file size limits.
4. Pass forged storage keys referencing objects owned by another user or channel.

The `POST /api/v1/uploads/:uploadId/finalize` endpoint enforces that:
- The caller owns the upload session (`upload.channel.userId === userId`).
- The storage key strictly conforms to the server-controlled folder (`raw/${channelId}/${uploadId}/...`).
- The object genuinely exists in storage with non-zero bytes and is within `MAX_UPLOAD_SIZE_BYTES`.
- The operation is idempotent: repeated finalization requests return existing transcoding state without enqueueing duplicate jobs.

### Processing Status Reference
- `PENDING`: Upload record created (or approved remote video URL registered); waiting for media transfer.
- `UPLOADING`: Direct upload permission minted; client is transferring bytes to object storage.
- `TRANSCODING`: Raw file verified and actively queued or undergoing FFmpeg adaptive multi-bitrate HLS encoding.
- `COMPLETED`: Transcoding successfully finished; HLS manifests and renditions published for playback.
- `FAILED`: Ingestion or transcoding failed (e.g. file size exceeded, corrupt media container, or worker error).

---

## 🖼️ Media Inspection (FFprobe) & Thumbnail Generation (FFmpeg)

### 1. What FFprobe does
FFprobe probes container headers, packet streams, and elementary track descriptors without decoding the entire video stream into raw uncompressed pixels. This allows the backend to instantaneously (< 50ms) verify video duration, resolution, frame rate, audio channel layouts, and container codecs before dedicating compute resources to heavy multi-bitrate transcoding. Corrupt files, 0-second containers, non-video payloads, and unsupported codecs are rejected immediately with descriptive errors.

### 2. Why thumbnails are generated before the page is rendered
Video streaming applications require image posters before playback begins:
- **Card and Feed Previews**: Home feeds and search result cards display static poster images without streaming multi-megabyte video containers.
- **Player Poster Placeholders**: The HTML5 player uses a `<video poster="...">` placeholder image while initial HLS chunks buffer.
- **Social Sharing**: OpenGraph and Twitter cards require high-resolution image previews.

### 3. Why temporary files must be cleaned up
Extracting frames, probing media, and downloading raw files produces scratch files on disk. If left behind after errors or normal completion, temporary files will rapidly exhaust available disk space (causing `ENOSPC` file system errors) and take down the server. The `makeThumbnails` pipeline wraps all intermediate scratch directories in a `try ... finally` block, ensuring immediate and guaranteed deletion of temporary files.

### 4. Schema Constraints on Thumbnails
The Vion PostgreSQL schema stores a single `Upload.thumbnailUrl` string. It intentionally does not maintain a separate database table for thumbnail metadata.
To support candidate thumbnail selection and listing, `listStoredThumbnails` securely lists objects beneath the controlled storage prefix `thumbnails/${channelId}/${videoId}/` in Supabase Storage. This delivers candidate thumbnail listings without inventing unmapped database tables.

---

## 🎬 Upload API Endpoints (`/api/v1/uploads`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/uploads` | Create new upload record and issue direct storage permission | Required |
| `POST` | `/api/v1/uploads/presigned-url` | Generate or renew signed upload URL for direct storage transfer | Required |
| `POST` | `/api/v1/uploads/remote-url` | Register approved remote video URL with SSRF protections | Required |
| `GET` | `/api/v1/uploads/:uploadId` | Complete upload session details (ownership enforced for private) | Optional |
| `GET` | `/api/v1/uploads/:uploadId/status` | Real-time processing status and progress percentage | Required |
| `PATCH` | `/api/v1/uploads/:uploadId` | Update metadata (title, description, visibility, thumbnail) | Required |
| `POST` | `/api/v1/uploads/:uploadId/finalize` | Verify stored object in storage and enqueue transcoding | Required |
| `DELETE` | `/api/v1/uploads/:uploadId` | Cancel/soft-delete upload and clean up raw storage objects | Required |

---

## ⚙️ Environment Configuration

Add the required variables to `backend/.env`. All variables are validated at startup with Zod in `src/config/config.ts`.

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | API HTTP port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | Neon PostgreSQL connection URI | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` |
| `FRONTEND_URL` | Allowed frontend origin for CORS | `http://localhost:3000` |
| `JWT_SECRET_KEY` | JWT signing secret | `your-secret-key-min-32-chars` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `your-client-id.apps.googleusercontent.com` |
| `SUPABASE_URL` | Supabase project URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret key (redacted from logs) | `eyJhbGciOi...` |
| `SUPABASE_RAW_BUCKET` | Bucket name for private raw uploads | `raw-videos` |
| `SUPABASE_PROCESSED_BUCKET` | Bucket name for public HLS streams | `processed-videos` |
| `SUPABASE_THUMBNAILS_BUCKET` | Bucket name for video posters | `thumbnails` |
| `SUPABASE_PUBLIC_URL` | Optional CDN or public custom domain | `https://cdn.vion.tv` |
| `REDIS_URL` | Redis connection URI | `redis://localhost:6379` |
| `FFMPEG_PATH` | Path to FFmpeg binary | `ffmpeg` |
| `FFPROBE_PATH` | Path to FFprobe binary | `ffprobe` |
| `TEMP_MEDIA_DIR` | Local scratch directory for video processing | `./tmp/media` |
| `MAX_UPLOAD_SIZE_BYTES` | Maximum video upload size in bytes | `524288000` (500 MB) |
| `MAX_PROCESSING_DURATION_SECONDS` | Maximum allowed job duration | `1800` (30 mins) |

> **Security Note**: Never expose `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` to the client. The backend diagnostics `getSanitizedConfigSummary()` strictly redacts all credentials.

---

## 🚀 Local Development Commands

### 1. Start Redis
```bash
docker compose up -d redis
```

### 2. Run the Express 5 API Server
```bash
bun run dev
```

### 3. Run the Background Transcoding Worker
```bash
# In a separate terminal
bun run worker
# or with file watching:
bun run worker:dev
```

---

## 🧵 Background Video Processing Queue & Worker Foundation

Video processing and thumbnail generation are computationally heavy tasks. To keep API latency low and prevent blocking HTTP threads, all media processing is offloaded to an asynchronous BullMQ queue backed by Redis.

### 1. Job Flow & Payload
- **Queue**: `video-transcoding` managed via BullMQ.
- **Payload**: Minimal lightweight JSON metadata `{ uploadId, channelId, rawVideoKey }`. **Video bytes are never stored in Redis or job data.**
- **Job ID**: Deterministic job identifier derived from the upload ID (`transcode-${uploadId}`) ensuring only one active or queued job can exist for an upload at any time.

### 2. 7-Stage Worker Lifecycle
Each transcoding job executed by `transcodingWorker.ts` proceeds through 7 explicit lifecycle stages:
1. **Receive Job**: Worker pulls job with bounded concurrency (default: 2 workers).
2. **Load Record**: Fetches the `Upload` record and channel relation from Neon PostgreSQL via Prisma.
3. **Verify Raw Object**: Checks that the expected video object exists with non-zero bytes in Supabase Storage.
4. **Validate State**: Idempotency check. If the upload is already marked `COMPLETED` in the database, processing is skipped idempotently without redundant work.
5. **Run Media Processing**: Invokes `mediaService.makeThumbnails()` to download the source, inspect with FFprobe, and extract resized poster thumbnails with FFmpeg.
6. **Record Status**: Updates `processingStatus` to `COMPLETED` and saves the selected thumbnail URL in the database. If all bounded retries fail, marks `processingStatus` as `FAILED`.
7. **Clean Up Scratch Files**: Scratch directories and temporary downloaded frames are guaranteed to be purged in a `finally` block to prevent disk bloat.

### 3. Architectural Separation of Concerns
Queue coordination and media processing are strictly isolated:
- **`videoQueue.ts`**: Decides *when* work is scheduled, job deduplication, retry configurations, and status queries. Does not contain any FFmpeg or media manipulation code.
- **`mediaService.ts`**: Performs *how* media is processed, probed, and converted. Does not depend on BullMQ or Redis.
- **`transcodingWorker.ts`**: Coordinates the pipeline by calling `mediaService` within the BullMQ processor context.

### 4. Reliability & Fault Recovery
- **Deterministic Job Deduplication**: `POST /uploads/:uploadId/finalize` uses `jobId: transcode-${uploadId}` and state queries (`active`, `waiting`, `delayed`) to ensure repeated requests return the current job rather than launching duplicates.
- **Bounded Retries with Backoff**: Configured for 3 attempts with exponential backoff (starting at 3s delay).
- **Graceful Shutdown**: Worker catches `SIGTERM` and `SIGINT` signals, halts job pickup, allows currently running transcoding jobs to wrap up cleanly, and closes Redis connections.
- **Structured Logging**: All queue and worker logs are prefixed with `[Upload: ${uploadId}] [Job: ${job.id}]` for end-to-end traceability without leaking tokens or database secrets.
- **Real Progress vs Database Status**: `GET /api/v1/uploads/:uploadId/status` distinguishes persistent database state (`PENDING`, `UPLOADING`, `TRANSCODING`, `COMPLETED`, `FAILED`) from transient queue state (`waiting`, `active`, `completed`, `failed`) and live progress without reporting fake percentages.

### 5. Service-to-Service Security (`/api/v1/internal/uploads`)
Internal management routes (used for direct worker-to-API communication or webhooks) require service authentication via:
- Header: `x-internal-secret: <JWT_SECRET_KEY>` or `Authorization: Bearer <JWT_SECRET_KEY>`
- Unauthorized requests receive `403 Forbidden` (`INTERNAL_AUTH_REQUIRED`).


### 4. Verification and Automated Tests
```bash
# Static TypeScript verification
bun run typecheck

# Automated upload lifecycle and SSRF tests
bun test

# Full architectural and route verification test
bun run verify

# Production build check
bun run build
```

---

## 🩺 Health and Readiness Endpoints

The API provides observability endpoints in `src/modules/health/health.routes.ts`:

- `GET /api/v1/health`: Overall health metadata, process uptime, and sanitized configuration summary.
- `GET /api/v1/health/live`: Container liveness probe.
- `GET /api/v1/health/ready`: Traffic readiness check verifying connectivity and latency for:
  - **Neon PostgreSQL**: Checks database read latency.
  - **Redis**: Checks Redis ping latency and connection state.
  - **Supabase Storage**: Checks bucket listing and storage connectivity.
  - **Queue Metrics**: Reports active, waiting, and completed job counts.
