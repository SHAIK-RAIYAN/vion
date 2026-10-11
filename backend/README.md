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
