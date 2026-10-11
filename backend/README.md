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

## 🎥 FFmpeg Transcoding and Adaptive Video Quality (HLS)

Vion implements an on-demand, adaptive bitrate streaming pipeline adhering to RFC 8216 and Apple's HLS Authoring Guidelines.

### 1. Core Concepts in Simple English
- **Resolution**: The pixel dimensions of each video frame (e.g. `1920x1080` for 1080p, `1280x720` for 720p).
- **Bitrate**: How much media data the stream transfers per second (e.g. `2,500 kbps`). Higher bitrates preserve fine detail and reduce compression artifacts on high-bandwidth connections.
- **Rendition**: One specific quality and bitrate version of a video tailored for a specific network tier.
- **Transcoding**: Converting the source video from its original raw encoding into multiple standardized H.264/AAC rendition packages.

### 2. What Is Expensive vs What Happens Once
- **Heavy & CPU-Intensive (Transcoding)**: Re-encoding raw video frames into multiple resolutions and bitrates using `libx264`. This is why transcoding runs exclusively in the background BullMQ worker rather than blocking the Express API.
- **Fast (< 50ms)**: FFprobe container inspection, thumbnail frame extraction, master playlist generation, and database status updates.
- **Run Once Per Upload**: The transcoding pipeline is strictly idempotent. Once an upload is marked `COMPLETED`, subsequent job invocations or API finalize calls skip re-encoding immediately.

### 3. Quality Ladder & Anti-Upscaling Rules
The quality ladder is defined in `src/config/transcodingProfiles.ts`:

| Rendition | Resolution | Video Bitrate | Peak (Maxrate) | Buffer (Bufsize) | Audio Bitrate | Target Bandwidth |
|---|---|---|---|---|---|---|
| **1080p** | `1920x1080` | `4500 kbps` | `5000 kbps` | `9000 kbps` | `128 kbps` | `5.2 Mbps` |
| **720p** | `1280x720` | `2500 kbps` | `2800 kbps` | `5000 kbps` | `128 kbps` | `2.95 Mbps` |
| **480p** | `854x480` | `1200 kbps` | `1400 kbps` | `2400 kbps` | `96 kbps` | `1.45 Mbps` |
| **360p** | `640x360` | `700 kbps` | `800 kbps` | `1400 kbps` | `96 kbps` | `890 kbps` |

> **Anti-Upscaling Guarantee**: The pipeline **never upscales** lower-resolution sources. A 480p source will only generate `480p` and `360p` renditions. If a video is submitted below 360p (e.g. 240p), the pipeline dynamically creates a custom baseline rendition matching the source dimensions.

### 4. Apple HLS Authoring Best Practices
1. **Target Segment Duration**: ~6 seconds (`-hls_time 6`), balancing caching efficiency with playback startup latency.
2. **Synchronized Keyframe (GOP) Alignment**: 
   - `-g <fps * 6> -keyint_min <fps * 6>`: Forces keyframes at exact 6-second boundaries.
   - `-sc_threshold 0`: Prevents scene changes from inserting extra keyframes that misalign segment boundaries between different qualities.
   - Keyframe alignment allows players (such as Safari AVPlayer or Hls.js) to switch smoothly between 360p and 1080p without visual freezes or buffering.
3. **Independent Segments**: `-hls_flags independent_segments` marks every segment as independently decodable without depending on previous segments.
4. **Master Playlist Formatting**:
   Renditions are declared with `#EXT-X-STREAM-INF:` in descending order of bandwidth, detailing `RESOLUTION`, `BANDWIDTH`, `AVERAGE-BANDWIDTH`, `FRAME-RATE`, and `CODECS`:
   ```m3u8
   #EXTM3U
   #EXT-X-VERSION:3
   #EXT-X-INDEPENDENT-SEGMENTS

   #EXT-X-STREAM-INF:BANDWIDTH=5200000,AVERAGE-BANDWIDTH=4800000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="avc1.4d4028,mp4a.40.2"
   1080p/index.m3u8
   #EXT-X-STREAM-INF:BANDWIDTH=2950000,AVERAGE-BANDWIDTH=2650000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2"
   720p/index.m3u8
   ```

### 5. Safe Process Execution & Example FFmpeg Arguments
The pipeline executes external binaries exclusively using `spawnProcess()` in `src/utils/processSpawner.ts` passing a validated array of arguments (never passing unescaped shell strings):

```bash
ffmpeg \
  -i input.mp4 \
  -map 0:v:0 -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p \
  -b:v 2500k -maxrate 2800k -bufsize 5000k \
  -vf "scale=-2:720" \
  -g 180 -keyint_min 180 -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*6)" \
  -map 0:a:0 -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_segment_type mpegts \
  -hls_flags independent_segments \
  -hls_list_size 0 \
  -hls_segment_filename "720p/segment_%03d.ts" \
  -y "720p/index.m3u8"
```

**Options Explained**:
- `-vf scale=-2:720`: Scales proportionally to 720p height while ensuring the width is an even number (required by `yuv420p` chroma subsampling).
- `-g 180 -keyint_min 180`: Places an IDR keyframe every 180 frames (6 seconds at 30 fps).
- `-sc_threshold 0`: Disables scene cut detection to maintain strict keyframe cadence.
- `-hls_playlist_type vod`: Writes `#EXT-X-PLAYLIST-TYPE:VOD` and terminates the playlist with `#EXT-X-ENDLIST`.
- `-hls_flags independent_segments`: Adds `#EXT-X-INDEPENDENT-SEGMENTS` so each chunk can decode standalone.

---

## 📺 Video Publication & Playback Delivery (`/api/v1/videos`)

Once video transcoding finishes, the processed upload can be published and streamed across the platform.

### 1. Publication Readiness Gate
- `POST /api/v1/videos`: Confirms channel ownership, verifies that `processingStatus === "COMPLETED"` and `hlsManifestUrl` is present.
- **Incomplete / Failed Rejection**: Incomplete, uploading, transcoding, or failed uploads cannot be published (`409 Conflict`).
- **Visibility Modes**:
  - `PUBLIC`: Available in global feed (`/feed`), search results (`/search`), and public channel views.
  - `UNLISTED`: Hidden from feed and search; playable only by direct URL (`/watch/:id`).
  - `PRIVATE`: Strictly gated to the channel owner; returns `403 Forbidden` to guests and other authenticated users.

### 2. Player Playback Configuration & Direct Manifest Delivery
- `GET /api/v1/videos/:videoId/playback`: Returns player configuration:
  ```json
  {
    "success": true,
    "data": {
      "videoId": "upl_123",
      "title": "My HLS Video",
      "streamType": "HLS",
      "hlsManifestUrl": "https://<supabase-project>.supabase.co/storage/v1/object/public/processed-videos/.../master.m3u8",
      "manifestRoute": "/api/v1/videos/upl_123/manifest",
      "isReady": true,
      "visibility": "PUBLIC",
      "renditions": [
        { "id": "v_1080", "resolution": "1080p", "url": "..." },
        { "id": "v_720", "resolution": "720p", "url": "..." }
      ]
    }
  }
  ```
- `GET /api/v1/videos/:videoId/manifest`: Dual-format HLS manifest endpoint:
  - When requested by media players (Safari, Hls.js, ExoPlayer), redirects via `302 Found` directly to the storage CDN master playlist (`Content-Type: application/vnd.apple.mpegurl`).
  - When requested by API consumers with `Accept: application/json` or `?format=json`, returns standard JSON response.
  - Video bytes and `.ts` chunks stream directly from storage/CDN, keeping Express HTTP threads completely lightweight.

### 3. Deliberate View Counting & Cooldown Strategy
- Normal `GET /api/v1/videos/:videoId` reads are debounced by a 60-second sliding cooldown cache per client IP/user ID.
- Rapid page refreshes, status polling, or manifest loops do NOT artificially inflate `viewCount`.

### 4. Private Media Security & Signed HLS Considerations
- **The Relative Path Dilemma in HLS**: Standard signed URLs (e.g. `createSignedUrl("private", "master.m3u8?token=xyz")`) only authorize `master.m3u8`. Because standard HLS players resolve relative child playlist paths (`720p/index.m3u8`) and chunks (`segment_000.ts`) without automatically forwarding HMAC query parameters, naive master-only signing causes child segment fetches to fail.
- **Vion's Multi-Tier Architecture**:
  - Server-side authorization check on `/playback` and `/manifest` rejecting unauthorized callers with `403 Forbidden` (`PRIVATE_VIDEO`).
  - Public & Unlisted videos are cached at edge CDN nodes from `processed-videos`.
  - For advanced DRM/signed cookies, CDN-level tokenized cookies (e.g. Cloudflare Signed Cookies) can be attached to the domain without modifying the database schema.

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

---

## 🧩 Core Domain Operations & Database Behaviors

The core business domains are implemented against the fixed Prisma schema (`contract.prisma`) with real PostgreSQL behaviors and zero schema drift:

### 1. Subscriptions (`/api/v1/channels/:channelId/subscription`, `/api/v1/users/me/subscriptions`)
- **Self-Subscription Prevention**: Creators cannot subscribe to their own channels (`400 Bad Request`).
- **Idempotency & Concurrency**: Handled via `@@unique([channelId, subscriberId])`. Repeated subscribe requests return the active subscription predictably; repeated unsubscribe requests succeed cleanly without throwing `404`.
- **Deterministic Pagination**: Uses multi-order sorting `[(s) => s.createdAt.desc(), (s) => s.id.desc()]` to guarantee stable pagination windows across pages.

### 2. Reactions (`/api/v1/videos/:videoId/like`)
- **Canonical Model**: Utilizes the `Interaction` model with `interactionType: "LIKE" | "DISLIKE"`.
- **Zero Schema Fabrication**: No fake like-count columns on `Upload`. Likes and dislikes are tallied live using database aggregation (`aggregate(agg => ({ count: agg.count() }))`).
- **Idempotent PUT & DELETE**: Repeated `PUT /like` preserves the reaction state; `DELETE /like` removes the reaction idempotently.
- **Concurrency Safety**: Catches unique constraint violations on `@@unique([userId, uploadId])` under rapid parallel requests and updates existing records smoothly.
- **Visibility Protection**: Private videos strictly reject reactions from unauthorized visitors (`403 Forbidden`).

### 3. Comments (`/api/v1/videos/:videoId/comments`, `/api/v1/comments/:commentId`)
- **Content Validation**: Content is trimmed and bounded (1 to 2000 characters). Whitespace-only strings are rejected with `400 Bad Request`.
- **Visibility Isolation**: Comments on `PRIVATE` videos cannot be created or viewed by unauthorized callers (`403 Forbidden`).
- **Stable Pagination**: Sorted via composite order `[(c) => c.createdAt.desc(), (c) => c.id.desc()]` preventing items from skipping or duplicating across pages when timestamps coincide.
- **Dual Deletion Permissions**: A comment can be deleted by either its author (`comment.userId === userId`) OR the channel owner of the video (`comment.upload.channel.userId === userId`).

### 4. Watch History (`/api/v1/history`)
- **Concurrency-Safe Upsert**: Handled via `@@unique([userId, uploadId])`. Handles parallel player heartbeat pings safely without constraint crashes.
- **Sanitized Progress**: Validates `progressTimeStamp` as non-negative integer seconds (`Math.max(0, floor(progress))`).
- **Visibility Checks**: Prevents unauthorized progress tracking on private videos.
- **Idempotent Cleanup**: Removing a single video or clearing all history succeeds cleanly.

### 5. Feed & Search (`/api/v1/feed`, `/api/v1/search`)
- **Feed**: Excludes private, unlisted, incomplete, and soft-deleted uploads. Supports dual pagination: standard offset `?page=1&limit=20` and cursor keyset pagination `?cursor=...&limit=20`.
- **Search**: Pure database-driven lookup executing PostgreSQL `ILIKE` on `Upload.title` and `Channel.channelName`. Avoids loading candidate tables into memory or N+1 queries.
- **Suggestions**: Returns distinct matching video titles directly from the database query.

### 6. Administration & Schema Prerequisite Documentation (`/api/v1/admin`)
- **Schema Prerequisite Note**: The fixed Prisma schema does not provide a `role` enum or `isAdmin` column on `User`.
- **Safe Authorization**: Administration routes are guarded via server-configured `ADMIN_EMAILS`. If `ADMIN_EMAILS` is not configured or the caller's email is not in the list, access is rejected with `403 Forbidden` (`FORBIDDEN_ADMIN_ACCESS`). No fake schema checks are used.
- **Categories & Notifications**: Categories provide platform taxonomy constants (`all`, `music`, `gaming`, `tech`, `education`, `entertainment`, `news`, `sports`, `podcasts`). Notifications endpoint returns valid schema-constrained empty collections, documenting that persistent notifications require a future database model.

---

## 🛠️ Complete Operational Runbook & Guide

### 1. How to Start Vion Locally

#### Prerequisites
- **Bun**: v1.1+ installed locally.
- **Docker**: For running the Redis container.
- **FFmpeg & FFprobe**: Version 6+ installed and available in system `PATH` (verified working with FFmpeg 8.1.1).

#### Step 1: Start Redis
```bash
docker compose up -d redis
```
Verify Redis is accepting connections:
```bash
docker compose exec redis redis-cli ping
# Response: PONG
```

#### Step 2: Start the Express 5 API
In a new terminal:
```bash
cd backend
bun run dev
```
The API server starts on `http://localhost:5000` and automatically connects to Neon PostgreSQL.

#### Step 3: Start the Transcoding Background Worker
In a separate terminal:
```bash
cd backend
bun run worker
```
The worker will verify Redis connectivity, validate Supabase Storage accessibility, and begin listening for `video-transcoding` queue jobs.

#### Step 4: Start the Next.js Frontend
In a third terminal:
```bash
cd frontend
bun run dev
```
The frontend is available at `http://localhost:3000`.

---

### 2. How to Configure Supabase and Neon

#### Neon Managed PostgreSQL
1. Create a PostgreSQL project on [neon.tech](https://neon.tech).
2. Copy the pooled connection string (e.g. `postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. Set in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```
4. **Prisma 8 RC Migration Note**:
   - Vion uses `@prisma/orm-postgres/runtime` with compiled contract artifacts (`contract.json` & `contract.d.ts`).
   - Run `bun run contract:emit` if you ever need to recompile the contract definition.
   - Do **NOT** run destructive Prisma migrate commands (`prisma migrate reset` or `db push --force-reset`) against shared Neon databases.

#### Supabase Storage
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In **Storage**, create three buckets:
   - `raw-videos`: Set to **Private** (authenticated service-role only; raw uploads).
   - `processed-videos`: Set to **Public** (public HLS playback delivery).
   - `thumbnails`: Set to **Public** (public image poster delivery).
3. Under **Project Settings > API**, copy the `Project URL` and `service_role` secret key.
4. Set in `backend/.env`:
   ```env
   SUPABASE_URL="https://<your-project-ref>.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="ey..."
   SUPABASE_RAW_BUCKET="raw-videos"
   SUPABASE_PROCESSED_BUCKET="processed-videos"
   SUPABASE_THUMBNAILS_BUCKET="thumbnails"
   ```
   > ⚠️ **Security Warning**: `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security. Never expose it to the browser, commit it to version control, or return it in API responses.

---

### 3. How to Upload a Video and Monitor its Status

#### Step 1: Create an Upload Session
Authenticate with the API to obtain a JWT cookie or Bearer token, then initialize the upload session:
```bash
curl -X POST http://localhost:5000/api/v1/uploads \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "chan_mychannel",
    "title": "My Awesome Video",
    "description": "Adaptive HLS streaming demo",
    "visibility": "PUBLIC",
    "declaredSizeBytes": 18751434,
    "declaredMimeType": "video/mp4"
  }'
```
Response returns `uploadId` and `status: "PENDING"`.

#### Step 2: Request a Direct Upload Capability (Signed PUT URL)
```bash
curl -X POST http://localhost:5000/api/v1/uploads/presigned-url \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "<UPLOAD_ID>",
    "fileName": "my-video.mp4",
    "fileSizeBytes": 18751434,
    "mimeType": "video/mp4"
  }'
```
Response returns:
- `uploadUrl`: Short-lived Supabase Storage signed upload URL.
- `storageKey`: Server-controlled object key (e.g. `raw/<channelId>/<uploadId>/<uuid>_my-video.mp4`).

#### Step 3: Direct Upload to Object Store
Transfer raw bytes directly from the client to Supabase Storage:
```bash
curl -X PUT "<SIGNED_UPLOAD_URL>" \
  -H "Content-Type: video/mp4" \
  --data-binary "@./sample.mp4"
```

#### Step 4: Finalize the Upload
Notify the backend that the byte transfer is complete. The backend validates the stored object exists, verifies ownership, and enqueues a transcoding job:
```bash
curl -X POST http://localhost:5000/api/v1/uploads/<UPLOAD_ID>/finalize \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "raw/<channelId>/<uploadId>/<uuid>_my-video.mp4"
  }'
```
The upload status advances to `TRANSCODING`.

#### Step 5: Poll Status
Monitor the background worker's progress:
```bash
curl -X GET http://localhost:5000/api/v1/uploads/<UPLOAD_ID>/status \
  -H "Authorization: Bearer <USER_JWT>"
```
Response provides:
```json
{
  "success": true,
  "data": {
    "uploadId": "<UPLOAD_ID>",
    "databaseStatus": "COMPLETED",
    "queueStatus": "completed",
    "progressPercentage": 100,
    "activeStage": "completed",
    "hlsManifestUrl": "https://<supabase-url>/storage/v1/object/public/processed-videos/processed/<channelId>/<videoId>/hls/master.m3u8",
    "thumbnailUrl": "https://<supabase-url>/storage/v1/object/public/thumbnails/thumbnails/<channelId>/<videoId>/candidate_1.jpg"
  }
}
```

---

### 4. How to Inspect Generated Thumbnails and HLS Assets

#### Local Temporary Inspection
During transcoding, all operations occur in `backend/tmp/media/transcode_<uploadId>_<uuid>/`:
- `source_input.mp4`: Local copy of raw video.
- `master.m3u8`: Apple RFC 8216 master playlist.
- `1080p/index.m3u8`, `720p/index.m3u8`, etc.: Variant playlists.
- `1080p/segment_000.ts`, etc.: Individual MPEG-TS 6-second media segments.

#### Supabase Storage Asset Layout
Once transcoding completes, assets are uploaded to the following deterministic paths:
```
processed-videos/
  └── processed/<channelId>/<videoId>/hls/
        ├── master.m3u8
        ├── 1080p/
        │     ├── index.m3u8
        │     ├── segment_000.ts
        │     └── ...
        ├── 720p/
        │     ├── index.m3u8
        │     └── ...
        └── 360p/
              └── ...

thumbnails/
  └── thumbnails/<channelId>/<videoId>/
        ├── candidate_1.jpg
        ├── candidate_2.jpg
        └── candidate_3.jpg
```

#### Inspect Master Playlist
Open `master.m3u8` in a text editor or via curl:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-STREAM-INF:BANDWIDTH=5300000,AVERAGE-BANDWIDTH=5000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002a,mp4a.40.2"
1080p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=3128000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720,FRAME-RATE=60.000,CODECS="avc1.4d401f,mp4a.40.2"
720p/index.m3u8
```

---

### 5. How to Test Playback and Visibility

#### Public Videos
Anyone can access details, manifest, and playback configuration:
```bash
# Get video metadata
curl -X GET http://localhost:5000/api/v1/videos/<VIDEO_ID>

# Get player playback configuration
curl -X GET http://localhost:5000/api/v1/videos/<VIDEO_ID>/playback

# Get master manifest URL directly
curl -X GET http://localhost:5000/api/v1/videos/<VIDEO_ID>/manifest
```

#### Unlisted Videos
Unlisted videos do not appear in feeds or search results, but anyone with the link can play them:
```bash
curl -X GET http://localhost:5000/api/v1/videos/<UNLISTED_VIDEO_ID>/playback
# Returns 200 OK with streamType and manifest URL
```

#### Private Videos
Private videos strictly reject unauthorized access:
```bash
# Unauthenticated request to private video
curl -X GET http://localhost:5000/api/v1/videos/<PRIVATE_VIDEO_ID>/playback
# Returns: 403 Forbidden ("You do not have permission to view this private video.")

# Channel owner request to private video
curl -X GET http://localhost:5000/api/v1/videos/<PRIVATE_VIDEO_ID>/playback \
  -H "Authorization: Bearer <OWNER_JWT>"
# Returns: 200 OK
```

#### Debounced View Counting
When testing playback, note that the backend applies an in-memory 60-second sliding window per IP + video combination (`shouldIncrementView`). Rapid refreshes or polling requests (`?poll=true` / `x-polling: true`) do not trigger repeated database writes or artificially inflate view counts.

---

### 6. Known Limitations and Next Performance Improvements

1. **HLS Private Content Delivery**:
   - *Current Implementation*: Public Supabase Storage bucket URLs are delivered for public/unlisted videos. For private videos, the API guards access to metadata and manifest endpoints with `403 Forbidden`.
   - *Limitation*: Because Supabase Storage uses simple public bucket policies for processed assets, if an authorized user copies and shares individual `.ts` segment URLs, the object store does not re-authenticate each segment request.
   - *Next Improvement*: Implement Cloudflare Stream or AWS CloudFront Signed Cookies (`CloudFront-Signature` cookie) covering the master manifest and all child segment paths under `/processed/...`.

2. **Sequential Transcoding per Job**:
   - *Current Implementation*: The BullMQ worker transcodes eligible renditions (1080p, 720p, 480p, 360p) sequentially for a video to prevent GPU/CPU saturation on a single worker node.
   - *Next Improvement*: For enterprise scale, adopt segment-level parallel chunk transcoding (e.g. splitting source into 10-second GOP chunks across a cluster of serverless workers and merging playlists).

3. **In-Memory View Debouncing**:
   - *Current Implementation*: Debouncing uses an in-memory `Map<string, number>` on the Express process.
   - *Next Improvement*: Move cooldown state to Redis keys (`SET video:view:{videoId}:{clientKey} 1 EX 60 NX`) so multiple Express replicas share the same sliding window across horizontal scaling.

