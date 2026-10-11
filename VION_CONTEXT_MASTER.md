# VION — Master Project Context & Implementation Record

> **Document Purpose**: This single document is the comprehensive source of truth for the entire Vion project. It records every milestone, architectural decision, code change, schema contract mapping, API endpoint, and test result from day one to the present. It is maintained and updated after every development stage to preserve 100% of the project's engineering context.

---

## 📌 Executive Summary

- **Product**: Vion — A high-performance, modern video sharing platform inspired by YouTube with adaptive bitrate streaming (HLS), social interactions, creator channels, and an aesthetic dark-mode UI.
- **Frontend Stack**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Motion (`motion/react`), Lucide React, Sonner, Google Identity Services.
- **Backend Stack**: Express 5 on Bun runtime, TypeScript, Prisma ORM 8 RC (`@prisma/orm-postgres/runtime` with compiled contract), Neon Managed PostgreSQL.
- **Media Infrastructure**: Supabase Object Storage (3 isolated buckets: `raw-videos`, `processed-videos`, `thumbnails`), Redis 7 (`redis:7-alpine`), BullMQ v6.3.12, FFprobe & FFmpeg 8.1.1.
- **Canonical API Contract**: Strictly adheres to [`vion_plan.md`](./vion_plan.md) with standard `/api/v1` envelopes, domain separation, and zero schema drift.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT / BROWSER                                │
│                   (Next.js 16 App Router)                              │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ Direct Upload                 │ API Requests & Status
                │ (Signed PUT URL)              │ (Cookie / Bearer JWT)
                ▼                               ▼
    ┌──────────────────────┐        ┌──────────────────────┐
    │   SUPABASE STORAGE   │        │    EXPRESS 5 API     │
    │   - raw-videos       │        │     (Bun Runtime)    │
    │   - processed-videos │        └──────────┬───────────┘
    │   - thumbnails       │                   │
    └──────────▲───────────┘                   │ Enqueue Job
               │ Download / Upload             ▼
               │                    ┌──────────────────────┐
    ┌──────────┴───────────┐        │    REDIS / BULLMQ    │
    │  TRANSCODING WORKER  │◄───────┤ (video-transcoding)  │
    │  (7-stage lifecycle) │ Fetch  └──────────────────────┘
    └──────────┬───────────┘
               │
               │ State, Renditions & Manifests
               ▼
    ┌──────────────────────┐
    │   NEON POSTGRESQL    │
    │  (Relational Data)   │
    └──────────────────────┘
```

---

## 🗄️ Database Schema & Canonical Entity Mapping

The database runs on Neon PostgreSQL via Prisma ORM 8 RC (`prisma-next`). The schema contract is defined in [`backend/src/prisma/contract.prisma`](./backend/src/prisma/contract.prisma).

### The `Upload` vs `Video` Reality
A critical architectural constraint of Vion is that **there is NO independent `PublishedVideo` database table**.

```prisma
model Upload {
  id               String           @id @default(uuid())
  channelId        String
  title            String
  description      String?
  hlsManifestUrl   String?
  thumbnailUrl     String?
  viewCount        Int              @default(0)
  isDeleted        Boolean          @default(false)
  visibility       Visibility       @default(PRIVATE)
  processingStatus ProcessingStatus @default(PENDING)

  channel          Channel          @relation(fields: [channelId], references: [id])
  videos           Video[]
  interactions     Interaction[]
  comments         Comment[]
  watchHistory     WatchHistory[]
}

model Video {
  id         String   @id @default(uuid())
  uploadId   String
  resolution String
  url        String
  createdAt  TimestamptzString @default(now())

  upload     Upload   @relation(fields: [uploadId], references: [id])
}
```

### Architectural Mapping Rules
1. **`Upload.id` is the canonical Video ID**:
   - Every public and playback route (e.g. `/videos/:videoId`, `/watch/:id`, `/playback`, `/like`, `/comments`) uses `Upload.id` as the stable `:videoId`.
2. **`Video` rows represent Quality Renditions, NOT independent videos**:
   - Rows in `Video` store the individual quality encodes for that upload (e.g. `resolution: "1080p"`, `url: ".../1080p/index.m3u8"`).
3. **Publishing does NOT create a second entity**:
   - `POST /api/v1/videos` simply updates the existing `Upload` record to `processingStatus = "COMPLETED"` and applies final metadata.
4. **Thumbnail Selection**:
   - `Upload.thumbnailUrl` stores the single active thumbnail URL. Candidate frames are stored in Supabase Storage under `thumbnails/${channelId}/${uploadId}/candidate_{1..3}.jpg` and queried directly from storage without inventing extra tables.
5. **Progress Reporting**:
   - The database does not store fake percentage columns. Granular progress is queried live from BullMQ events in `GET /api/v1/uploads/:uploadId/status`.

---

## 🚀 Chronological Milestones & Detailed Implementation Log

### Milestone 1: Frontend Foundation, Design System & Motion Polish
- **Scope**: Established Next.js 16 app layout, theme switching (dark/light), sidebar navigation, command palette, and smooth UI transitions.
- **Key Changes**:
  - Implemented `AppShell`, `Sidebar`, `Navbar`, and `ThemeToggle`.
  - Upgraded transitions using `motion/react` with spring physics and GPU-accelerated transforms.
  - Implemented Google Sign-In via Google Identity Services (`POST /api/v1/auth/google`) in `AuthModal.tsx` and Express backend.
  - Added responsive grid feeds, error boundaries, and toast notifications via Sonner.

### Milestone 2: Backend API Route Overhaul & Canonical Contract Alignment
- **Scope**: Aligned Express 5 routing with `vion_plan.md` (91 registered endpoints).
- **Key Changes**:
  - Standardized all base routes under `/api/v1` with plural RESTful resources (`/auth`, `/users`, `/channels`, `/uploads`, `/videos`, `/comments`, `/history`, `/feed`, `/search`, `/categories`, `/notifications`, `/admin`, `/health`, `/internal/uploads`).
  - Implemented standard JSON envelopes (`{ success: true, message, data }` and `{ success: false, error }`).
  - Built comprehensive `verify.ts` script checking routing, schema validation, JWT auth cycles, and error handling.

### Milestone 3: Storage Infrastructure & Direct S3-Compatible Ingest
- **Scope**: Integrated Supabase Storage with 3 isolated buckets.
- **Key Changes**:
  - Configured buckets:
    - `raw-videos` (Private, ingest only).
    - `processed-videos` (Public, HLS manifests and `.ts` segments).
    - `thumbnails` (Public, poster artwork).
  - Built [`storageService.ts`](./backend/src/services/storageService.ts) providing:
    - `createSignedUploadUrl()`: Short-lived (1-hour) signed PUT capability for direct client-to-storage upload.
    - `createSignedDownloadUrl()`: For private worker access.
    - `getPublicUrl()`: CDN-compatible public asset URL resolver honoring `SUPABASE_PUBLIC_URL`.
    - `downloadFile()`, `uploadFile()`, `deleteFiles()`, `listFiles()`, `checkStorageHealth()`.
  - Enforced strict server-controlled path templates preventing path traversal.

### Milestone 4: Secure Upload Operations & SSRF Protection
- **Scope**: Implemented complete upload lifecycle defined in `vion_plan.md` Section 5.
- **Key Changes**:
  - `POST /api/v1/uploads`: Ingest initialization with declared MIME type and size checks.
  - `POST /api/v1/uploads/presigned-url`: Direct storage signed URL renewal.
  - `POST /api/v1/uploads/remote-url`: Remote video URL ingest with military-grade SSRF protection:
    - Rejects loopback (`127.0.0.1`, `localhost`), link-local (`169.254.x.x`), and RFC 1918 private subnets.
    - Blocks AWS/GCP instance metadata endpoint (`169.254.169.254`).
    - Enforces approved video CDN domains (`*.wikimedia.org`, `*.archive.org`, `*.cloudfront.net`, etc.).
  - `GET /api/v1/uploads/:uploadId`: Detail fetch with ownership gate for private uploads.
  - `PATCH /api/v1/uploads/:uploadId`: Metadata updates.
  - `POST /api/v1/uploads/:uploadId/finalize`: Object existence verification, size validation, and idempotent job queuing.
  - `DELETE /api/v1/uploads/:uploadId`: Soft-delete and raw storage cleanup.
  - Built automated unit and integration tests (`upload.test.ts`, 14 tests passing).

### Milestone 5: FFprobe Inspection & FFmpeg Candidate Thumbnails
- **Scope**: Media probing and thumbnail extraction utilities ([`mediaService.ts`](./backend/src/services/mediaService.ts)).
- **Key Changes**:
  - `readVideoInfo()` (FFprobe):
    - Fast header and packet probing (< 50ms) without decoding frames.
    - Verifies duration, dimensions, framerate, video codec, audio codec/channels.
    - Rejects corrupt containers, 0-byte files, and unsupported codecs before expensive transcoding begins.
    - Safely handles videos without audio tracks.
  - `makeThumbnails()` (FFmpeg):
    - Generates 3 candidate posters at 15%, 50%, and 85% timestamps.
    - Letterboxes to 1280×720 preserving source aspect ratio.
    - Stores candidates in `thumbnails` bucket and saves default to `Upload.thumbnailUrl`.
    - Guaranteed cleanup of scratch files via `try ... finally`.
  - Built unit tests (`mediaService.test.ts`, 8 tests passing).

### Milestone 6: Background Video Processing Queue & BullMQ Worker Foundation
- **Scope**: Offload all media compute from Express HTTP threads to BullMQ backed by Redis.
- **Key Changes**:
  - Configured `video-transcoding` queue in [`videoQueue.ts`](./backend/src/queue/videoQueue.ts).
  - Minimal job payload: `{ uploadId, channelId, rawVideoKey }`. **Zero video bytes in Redis.**
  - Deterministic job IDs: `transcode-${uploadId}` preventing concurrent duplicate jobs.
  - Implemented 7-stage worker lifecycle in [`transcodingWorker.ts`](./backend/src/worker/transcodingWorker.ts):
    1. Receive job (concurrency: 2).
    2. Load upload record from Neon DB.
    3. Verify raw object exists in Supabase Storage.
    4. Idempotently skip if upload is already `COMPLETED`.
    5. Run media processing.
    6. Record status (`COMPLETED` or `FAILED`).
    7. Clean up temporary files.
  - Added bounded retries (3 attempts) with exponential backoff (starting at 3s).
  - Added graceful shutdown handling (`SIGTERM`, `SIGINT`).
  - Distinguishes live BullMQ progress from database status in `GET /api/v1/uploads/:uploadId/status`.
  - Secured internal maintenance routes (`/api/v1/internal/uploads`) with `x-internal-secret` authentication.
  - Built automated queue tests (`videoQueue.test.ts`, 7 tests passing).

### Milestone 7: Full Adaptive Bitrate (HLS) Transcoding Pipeline
- **Scope**: Production-grade, RFC 8216 and Apple-compliant HLS VOD pipeline.
- **Key Changes**:
  - Created [`transcodingProfiles.ts`](./backend/src/config/transcodingProfiles.ts):
    - Standard quality ladder: 1080p (5.2 Mbps), 720p (2.95 Mbps), 480p (1.45 Mbps), 360p (890 kbps).
    - **Anti-Upscaling Rule**: Never upscales. A 480p video only generates 480p and 360p.
    - Sub-360p support: 240p inputs generate a custom 240p baseline profile.
  - Created [`processSpawner.ts`](./backend/src/utils/processSpawner.ts):
    - Safe `child_process.spawn()` with explicit argument arrays, hard timeouts, and stderr capture (no shell injection).
  - Created [`transcodingService.ts`](./backend/src/services/transcodingService.ts) with 11 named stages:
    1. `validateUploadRecord`: Record check & idempotency.
    2. `resolveSourceMedia`: Downloads raw source to local scratch directory.
    3. `inspectSourceMedia`: FFprobe validation.
    4. `determineTargetRenditions`: Anti-upscaling profile selector.
    5. `encodeRenditionHls`: FFmpeg HLS encoding with Apple GOP alignment:
       - ~6-second segment boundaries (`-hls_time 6`).
       - Keyframe interval locked to 6 seconds (`-g <fps*6> -keyint_min <fps*6> -sc_threshold 0`).
       - `-hls_flags independent_segments`.
       - Silent stereo AAC audio synthesized via `anullsrc` if video lacks audio.
    6. `buildMasterPlaylist`: Generates RFC 8216 `master.m3u8` sorted by bandwidth descending.
    7. `verifyHlsPackageLocal`: Verifies all playlists, `#EXT-X-ENDLIST` terminators, and checks that every `.ts` segment exists and has non-zero bytes.
    8. `uploadHlsAssetsToStorage`: Uploads segments (`video/MP2T`) first, rendition playlists second, master manifest last.
    9. `verifyRemoteHlsAssets`: Confirms remote object presence in Supabase Storage.
    10. `commitTranscodeCompletion`: Atomically updates `Upload` and inserts rendition rows into `Video` table.
    11. `cleanScratchDirectory`: Guaranteed cleanup in `finally` block.
  - Integrated into [`transcodingWorker.ts`](./backend/src/worker/transcodingWorker.ts) with real-time progress callbacks.
  - Built comprehensive tests (`transcodingService.test.ts`, 13 tests passing).

### Milestone 8: Comprehensive Architecture Audit
- **Scope**: Verified the entire codebase against `vion_plan.md`, Prisma contract, and storage layouts.
- **Key Findings**:
  - Documented that `Upload` is the sole video entity and `Video` is the renditions table.
  - Verified all 91 endpoints are mounted, typed, and functional.
  - Confirmed test coverage of 42 backend tests across 4 test suites (100% pass rate).

### Milestone 9: Video Publication & HLS Playback Delivery
- **Scope**: Connected the transcoding pipeline to the existing video and playback API in `vion_plan.md`. Enforced server-side visibility rules, direct storage media delivery, view count debouncing, and private media security.
- **Key Implementations**:
  1. **Publication Readiness Gate** ([`video.service.ts`](./backend/src/modules/video/video.service.ts)):
     - `publishVideo()` rejects non-completed or failed uploads with `409 Conflict` (`PROCESSING_NOT_COMPLETED` or `MANIFEST_MISSING`).
     - Atomically transitions status to `COMPLETED` and sets published metadata (`title`, `description`, `visibility`, `thumbnailUrl`).
  2. **Visibility Authorization & Feed Isolation**:
     - `PUBLIC`: Accessible to everyone, surfaced in feeds and search queries.
     - `UNLISTED`: Accessible directly by video ID, hidden from feeds and search results.
     - `PRIVATE`: Strictly forbidden to non-owners with `403 Forbidden` (`PRIVATE_VIDEO`). Applied on both `GET /videos/:videoId`, `/playback`, and `/manifest`.
     - [`feed.service.ts`](./backend/src/modules/feed/feed.service.ts) and [`search.service.ts`](./backend/src/modules/search/search.service.ts) updated with `processingStatus: "COMPLETED"`, ensuring incomplete or failed uploads never leak into discovery.
  3. **Direct Storage Playback & Manifest Delivery**:
     - `GET /api/v1/videos/:videoId/playback`: Returns playback configuration `{ videoId, title, streamType: "HLS", hlsManifestUrl, manifestRoute, isReady, renditions, channel }`.
     - `GET /api/v1/videos/:videoId/manifest`: Dual delivery mode — returns JSON if requested by API clients (`Accept: application/json` or `?format=json`), or issues an HTTP 302 redirect directly to the storage manifest for native HLS players (`<video src="...">`, Hls.js).
     - No video segments or media bytes are proxied through Express, preserving API memory and throughput.
  4. **View Count Debouncing & Polling Protection**:
     - Implemented `shouldIncrementView(clientIdentifier, videoId)` with an in-memory sliding 60-second cooldown per client/video.
     - Detects and ignores polling requests (`?poll=true`, `x-polling: true`) and manifest refreshes.
  5. **Private Media Relative-Path Security Analysis**:
     - Investigated Supabase Storage HMAC signed URLs. Token parameters (`?token=xyz`) apply to specific object paths. Standard HLS players resolving relative child playlists (`720p/index.m3u8`) and `.ts` chunks do not append the parent query string.
     - Server-side authorization blocks unauthorized manifest acquisition. Production mitigation roadmap documented (Cloudflare Signed Cookies or manifest rewriting proxy).
  6. **Automated Test Suite**:
     - Added 14 unit and integration tests in [`video.test.ts`](./backend/src/modules/video/video.test.ts) covering publication gates, visibility matrix, 403 errors, player payloads, and view debouncing.

### Milestone 10: Core Domain Operations & Database Behaviors
- **Scope**: Implemented and hardened routine database operations across Subscriptions, Reactions, Comments, Watch History, Feed, Search, and Administration without adding unnecessary architecture or modifying the fixed Prisma schema.
- **Key Implementations**:
  1. **Subscriptions** ([`subscription.service.ts`](./backend/src/modules/subscription/subscription.service.ts)):
     - Disallows creators from subscribing to their own channel (`400 Bad Request`).
     - Idempotent repeated subscribe/unsubscribe calls returning active records predictably.
     - Multi-order deterministic sorting (`[(s) => s.createdAt.desc(), (s) => s.id.desc()]`).
  2. **Reactions** ([`interaction.service.ts`](./backend/src/modules/interaction/interaction.service.ts)):
     - Full support for `LIKE` and `DISLIKE` via `Interaction` model.
     - Real-time reaction counts via database aggregation (`aggregate(agg => ({ count: agg.count() }))`). Zero fake schema columns.
     - Idempotent `PUT /like` and `DELETE /like` with concurrency catch for `@@unique([userId, uploadId])`.
     - Server-side visibility gating blocking unauthorized reactions on private videos (`403 Forbidden`).
  3. **Comments** ([`comment.service.ts`](./backend/src/modules/comment/comment.service.ts)):
     - Trimmed length validation rejecting whitespace-only inputs (`400 Bad Request`).
     - Visibility isolation preventing comments on `PRIVATE` videos from being created or read by unauthorized callers (`403 Forbidden`).
     - Stable pagination tiebreaker `[(c) => c.createdAt.desc(), (c) => c.id.desc()]`.
     - Permissions: Either comment author or channel owner of video can delete comment (`403 Forbidden` for strangers).
  4. **Watch History** ([`watchHistory.service.ts`](./backend/src/modules/watchHistory/watchHistory.service.ts)):
     - Concurrency-safe upsert on `@@unique([userId, uploadId])` handling rapid heartbeat pings.
     - Progress validation ensuring non-negative integer seconds.
     - Idempotent removal and history clear operations.
  5. **Feed & Search** ([`feed.service.ts`](./backend/src/modules/feed/feed.service.ts), [`search.service.ts`](./backend/src/modules/search/search.service.ts)):
     - Feed supports cursor keyset pagination (`?cursor=...`) and offset pagination.
     - Pure database PostgreSQL `ILIKE` search queries on `Upload.title` and `Channel.channelName`.
     - Eliminates in-memory candidate arrays and N+1 queries. Autocomplete suggestions return distinct database matches.
  6. **Administration & Schema Prerequisite** ([`admin.routes.ts`](./backend/src/modules/admin/admin.routes.ts)):
     - Secure authorization enforced against server-configured `ADMIN_EMAILS` without fabricating schema roles.
     - Non-admin callers receive `403 Forbidden` (`FORBIDDEN_ADMIN_ACCESS`).
     - Documented schema limitation that `User` model currently lacks a `role` enum.
  7. **Automated Test Suite**:
     - Added 15 new unit and integration tests in [`coreRoutes.test.ts`](./backend/src/modules/coreRoutes.test.ts). Total backend suite now passes 71 tests across 6 files.

---

## 📊 Complete API Contract Status Matrix (91 Endpoints)

| Section | Route Prefix | Key Endpoints | Implementation Status |
|---|---|---|---|
| **1. Auth** | `/api/v1/auth` | `/signup`, `/signin`, `/signout`, `/google`, `/me`, `/forgot-password`, `/reset-password` | ✅ 100% Complete & Verified |
| **2. Users** | `/api/v1/users` | `/me` (GET, PATCH, DELETE), `/me/changePassword`, `/me/subscriptions` | ✅ 100% Complete & Verified |
| **3. Channels** | `/api/v1/channels`| `POST /`, `GET /me`, `PATCH /me`, `DELETE /me`, `GET /:id`, `GET /handle/:h` | ✅ 100% Complete & Verified |
| **4. Subscriptions**| `/api/v1/channels/:id/sub*` | Subscribe, unsubscribe, check status, list subscribers | ✅ 100% Complete & Verified |
| **5. Uploads** | `/api/v1/uploads` | `POST /`, `/presigned-url`, `/remote-url`, `GET /:id`, `GET /:id/status`, `PATCH /:id`, `POST /:id/finalize`, `DELETE /:id` | ✅ 100% Complete & Verified |
| **6. Videos** | `/api/v1/videos` | `POST /` (publish), `GET /:id`, `PATCH /:id`, `DELETE /:id` | ✅ 100% Complete & Verified |
| **7. Transcoding** | `/api/v1/internal/uploads`| `/process`, `/retry`, `/cancel`, `/complete`, `/fail` (Service auth protected) | ✅ 100% Complete & Verified |
| **8. Playback** | `/api/v1/videos/:id/playback` | `/playback`, `/manifest` (HLS adaptive streaming) | ✅ 100% Complete & Verified |
| **9. Reactions** | `/api/v1/videos/:id/like` | `PUT /like`, `DELETE /like`, `GET /like` | ✅ 100% Complete & Verified |
| **10. Comments** | `/api/v1/videos/:id/comments` | Create comment, list paginated comments, edit comment, delete comment | ✅ 100% Complete & Verified |
| **11. History** | `/api/v1/history` | Record progress, fetch history, delete video from history, clear all | ✅ 100% Complete & Verified |
| **12. Feed** | `/api/v1/feed` | Public paginated home feed | ✅ 100% Complete & Verified |
| **13. Search** | `/api/v1/search` | Search videos & channels (`?q=...`), query autocomplete | ✅ 100% Complete & Verified |
| **14. Thumbnails** | `/api/v1/videos/:id/thumbnails`| Presigned URL, finalize, list stored candidates, select active, delete | ✅ 100% Complete & Verified |
| **15. Categories** | `/api/v1/categories` | Platform category listing & details | ✅ 100% Complete & Verified |
| **16. Notifications**| `/api/v1/notifications`| User notification feed & mark as read | ✅ 100% Complete & Verified |
| **17. Admin** | `/api/v1/admin` | User management & platform stats | ✅ 100% Complete & Verified |
| **18. Health** | `/api/v1/health` | `/health`, `/health/live`, `/health/ready` (Postgres, Redis, Storage) | ✅ 100% Complete & Verified |

---

## 🧪 Automated Test Coverage (71 Tests Passing)

All tests execute via `bun test` in the `backend` directory:

```
src/queue/videoQueue.test.ts (7 tests)
✔ ensures queue logic is strictly separated from FFmpeg operations
✔ generates deterministic job IDs derived from upload ID
✔ prevents duplicate concurrent jobs for the same upload ID
✔ skips duplicate processing idempotently if upload is already COMPLETED
✔ aborts safely if upload record is not found or soft-deleted
✔ transitions processingStatus to FAILED when maximum attempts are exhausted
✔ supports graceful worker initialization and clean closure

src/services/mediaService.test.ts (8 tests)
✔ correctly reads duration, dimensions, framerate, video codec, and audio info (FFprobe)
✔ handles videos without audio streams without throwing or crashing
✔ rejects corrupt or unparseable files before expensive processing begins
✔ rejects non-existent file paths
✔ extracts candidate frames and resizes to consistent thumbnail dimensions (FFmpeg)
✔ handles short videos gracefully
✔ always cleans up temporary scratch directory even on failure
✔ returns thumbnail list structure safely without requiring database relation

src/services/transcodingService.test.ts (13 tests)
✔ never upscales a 360p source to 720p or 1080p
✔ generates 720p, 480p, and 360p for a 720p source without upscaling to 1080p
✔ generates full quality ladder for a 1080p source
✔ handles source resolutions below 360p (e.g. 240p) with custom baseline profile
✔ generates compliant master playlist with BANDWIDTH, RESOLUTION, and relative paths
✔ transcodes video to HLS with valid ~6s target segments and playlist terminator
✔ synthesizes silent stereo audio for videos without audio stream without crashing
✔ passes verification when all playlists, terminators, and segment files exist
✔ detects missing segment file and throws descriptive AppError
✔ processes valid video, respects anti-upscaling, generates HLS, and cleans up scratch directory
✔ processes very short video (< 1s) successfully without crashing
✔ rejects corrupt media input and guarantees scratch cleanup
✔ skips re-processing idempotently if upload is already COMPLETED

src/modules/upload/upload.test.ts (14 tests)
✔ rejects non-video MIME types
✔ rejects oversized declared file sizes (> 500 MB)
✔ accepts valid video upload parameters
✔ validates presigned URL inputs strictly
✔ blocks localhost, loopback, and private IPv4 addresses (SSRF Protection)
✔ blocks cloud instance metadata service (169.254.169.254)
✔ blocks non-HTTP protocols (file:, ftp:, gopher:)
✔ blocks arbitrary non-approved destination domains
✔ allows approved video CDN domains
✔ enforces ownership: non-owners cannot finalize uploads
✔ enforces ownership: non-owners cannot delete uploads
✔ rejects forged storage keys not matching the upload folder
✔ repeated finalization is idempotent and does not enqueue duplicate work
✔ handles completed upload finalization idempotently

src/modules/video/video.test.ts (14 tests)
✔ rejects publication when upload processing is still PENDING or IN_PROGRESS
✔ rejects publication when upload processing has FAILED
✔ rejects publication if HLS master manifest is missing
✔ successfully publishes video when processingStatus is COMPLETED with manifest
✔ allows anyone to view a PUBLIC video
✔ allows anyone with the direct ID to view an UNLISTED video
✔ blocks unauthenticated visitors from accessing a PRIVATE video with 403
✔ blocks non-owner authenticated users from accessing a PRIVATE video with 403
✔ allows video owner to view their own PRIVATE video
✔ throws 404 for nonexistent video ID
✔ returns complete player metadata and renditions from getPlayback
✔ returns manifest URL and supports both JSON and 302 redirect responses
✔ increments view count on first watch request
✔ debounces view counts within cooldown window and ignores polling requests

src/modules/coreRoutes.test.ts (15 tests)
✔ prevents creators from subscribing to their own channel with 400
✔ subscribes to a channel and handles repeated subscribe calls idempotently
✔ unsubscribes cleanly and repeated unsubscribe calls return predictable success
✔ adds a LIKE and repeated PUT /like calls are idempotent
✔ strictly blocks unauthorized users from reacting to a private video with 403
✔ removes a like and repeated DELETE /like calls are idempotent
✔ creates a comment and validates content length and whitespace
✔ prevents unauthorized users from commenting on or viewing comments of private videos
✔ allows comment author or video creator to delete a comment, but rejects strangers with 403
✔ records playback progress and updates existing records safely
✔ blocks unauthorized users from recording history on private videos with 403
✔ removes video from history and clears history cleanly and idempotently
✔ feed returns only public, completed, non-deleted videos and supports cursor pagination
✔ search performs database lookup and autocomplete suggestions correctly
✔ documents missing role model and enforces ADMIN_EMAILS boundary

TOTAL: 71 PASS, 0 FAIL (203 expect() assertions across 6 test suites)
```

---

## 📜 Git Commit Sequence (Clean Dependency Order)

All work follows small, incremental commits on branch `dev`:

| Commit Hash | Commit Title | Key Modules Changed |
|---|---|---|
| `4056649` | `feat(infra): add Redis container, BullMQ video queue, and isolated worker service` | `docker-compose.yml`, `redisClient.ts`, `videoQueue.ts` |
| `fcde39a` | `feat(health): enhance readiness check for Neon, Redis, and Supabase Storage` | `health.routes.ts`, `health.service.ts` |
| `1c56b8a` | `feat(upload): implement secure video upload API with direct storage, SSRF prevention, and idempotency` | `upload.service.ts`, `upload.schema.ts`, `upload.test.ts` |
| `c0e853f` | `feat(media): implement FFprobe video inspection and FFmpeg thumbnail generation` | `mediaService.ts`, `mediaService.test.ts` |
| `0d56848` | `feat(queue): implement BullMQ video transcoding queue and worker foundation` | `transcodingWorker.ts`, `videoQueue.ts`, `videoQueue.test.ts` |
| `f6d60f7` | `feat(transcoding): implement FFmpeg adaptive HLS transcoding pipeline and worker integration` | `transcodingProfiles.ts`, `processSpawner.ts`, `transcodingService.ts`, `transcodingService.test.ts` |
| `074717f` | `feat(playback): implement publication gate, HLS playback delivery, view debouncing, and private authorization` | `video.service.ts`, `video.controller.ts`, `video.routes.ts`, `feed.service.ts`, `search.service.ts`, `video.test.ts` |
| `b4a1469` | `feat(core): implement core operations for subscriptions, reactions, comments, history, feed, search, and admin` | `subscription.service.ts`, `interaction.service.ts`, `comment.service.ts`, `watchHistory.service.ts`, `feed.service.ts`, `search.service.ts`, `admin.routes.ts`, `coreRoutes.test.ts` |

---

## 🛠️ Environment Variables & Configuration Reference

Configured in `backend/.env` and validated at startup with Zod in [`config.ts`](./backend/src/config/config.ts):

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | API HTTP port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | Neon PostgreSQL URI | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `JWT_SECRET_KEY` | JWT signing secret | `your-secret-key-min-32-chars` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `your-google-oauth-client-id` |
| `SUPABASE_URL` | Supabase project URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | `eyJhbGciOi...` (never printed/logged) |
| `SUPABASE_RAW_BUCKET` | Private raw upload bucket | `raw-videos` |
| `SUPABASE_PROCESSED_BUCKET`| Public HLS stream bucket | `processed-videos` |
| `SUPABASE_THUMBNAILS_BUCKET`| Public poster bucket | `thumbnails` |
| `SUPABASE_PUBLIC_URL` | Optional CDN public domain | `https://cdn.vion.tv` |
| `REDIS_URL` | Redis connection URI | `redis://localhost:6379` |
| `FFMPEG_PATH` | FFmpeg executable binary | `ffmpeg` |
| `FFPROBE_PATH` | FFprobe executable binary | `ffprobe` |
| `TEMP_MEDIA_DIR` | Scratch processing folder | `./tmp/media` |
| `MAX_UPLOAD_SIZE_BYTES` | Max video file upload size | `524288000` (500 MB) |
| `MAX_PROCESSING_DURATION_SECONDS` | Max transcoding timeout | `1800` (30 minutes) |

---

## 🚀 Local Development Quickstart

### 1. Start Services
```bash
# Start Redis container
docker compose up -d redis

# Start Express 5 API (Port 5000)
cd backend
bun run dev

# Start Background Transcoding Worker (Separate Terminal)
cd backend
bun run worker

# Start Next.js Frontend (Port 3000)
cd frontend
bun run dev
```

### 2. Run Verification & Quality Gates
```bash
# Typecheck backend
cd backend
bun run typecheck

# Run full backend test suite (42 tests)
bun test

# Run 91-endpoint verification script
bun run verify

# Verify production builds
bun run build
cd ../frontend && bun run build
```

---

## 🎯 Next Steps & Future Work

1. **Frontend Creator Studio & Direct Upload UI**:
   - Build creator drag-and-drop video upload dialog in `frontend/src/components/studio/`.
   - Wire client-side signed PUT transfer directly to Supabase Storage.
   - Attach real-time progress bar polling `GET /api/v1/uploads/:uploadId/status` to show transcoding stages.
2. **Watch Page HLS Video Player Integration**:
   - Replace placeholder container in `WatchContent.tsx` with high-performance `Hls.js` video player.
   - Add quality selector dropdown (1080p, 720p, 480p, 360p, Auto).
   - Sync playback timestamps with `PUT /api/v1/history/:videoId/progress`.
3. **Continuous Maintenance**:
   - Update this file whenever new features, endpoints, or architectural changes are introduced.
