# Chapter 6: Storage, Queues & Background Workers

This document details the external infrastructure powering Vion: **Supabase Object Storage**, **Neon Serverless PostgreSQL**, and the **Redis/BullMQ Background Worker**.

---

## 1. Infrastructure Overview

A production video platform requires three distinct types of infrastructure:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Vion Infrastructure                           │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ Neon PostgreSQL    │ Supabase Storage   │ Redis + BullMQ Worker        │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Relational Data    │ Object Storage     │ Message Broker & Processing  │
│ - User accounts    │ - Raw source MP4s  │ - Job queueing               │
│ - Channels         │ - HLS manifests    │ - Worker coordination        │
│ - Upload records   │ - Video segments   │ - Retry management           │
│ - Comments & Likes │ - Video thumbnails │ - CPU-intensive FFmpeg tasks │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

---

## 2. Supabase Object Storage Architecture

Vion uses Supabase Storage (an S3-compatible object storage service) to house all binary media assets.

### 2.1. The Three Storage Buckets
Configured in [`backend/src/config/config.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/config/config.ts) and [`backend/src/services/storageService.ts#L14-L21`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/services/storageService.ts#L14-L21):

```typescript
export const STORAGE_BUCKETS = {
  RAW: "raw-videos",          // Private bucket
  PROCESSED: "processed-videos", // Public bucket
  THUMBNAILS: "thumbnails",      // Public bucket
} as const;
```

| Bucket Name | Access Policy | What It Contains | Why It Has This Policy |
| :--- | :---: | :--- | :--- |
| **`raw-videos`** | **Private** | Raw un-transcoded videos directly from user browsers. | Security: Prevents unauthorized users from accessing large, uncompressed source files or copyright-sensitive raw uploads. Accessible only via short-lived signed URLs. |
| **`processed-videos`** | **Public** | Master `.m3u8` playlists, variant playlists, and `.ts` media segments. | High-throughput streaming: Video players (browsers, TVs, phones) must fetch video segments at high speeds without authentication overhead. |
| **`thumbnails`** | **Public** | Generated poster JPEGs and candidate thumbnails. | Fast loading: Allows video cards and home feeds to display video covers immediately via public CDN URLs. |

---

### 2.2. Object Path Layout Conventions
Vion enforces a strict, hierarchical path structure to guarantee tenant isolation and prevent accidental file collisions:

```
raw-videos/
  └── raw/
      └── {channelId}/
          └── {uploadId}/
              └── {uuid}_{cleanFileName}.mp4

processed-videos/
  └── processed/
      └── {channelId}/
          └── {uploadId}/
              └── hls/
                  ├── master.m3u8
                  ├── 1080p/
                  │   ├── 1080p.m3u8
                  │   ├── segment_000.ts
                  │   └── segment_001.ts
                  ├── 720p/
                  │   └── ...
                  └── 480p/
                      └── ...

thumbnails/
  └── thumbnails/
      └── {channelId}/
          └── {uploadId}/
              ├── default.jpg
              ├── candidate_1.jpg
              ├── candidate_2.jpg
              └── candidate_3.jpg
```

---

### 2.3. The Presigned Direct-Upload Flow
Why does Vion use signed URLs instead of uploading files through Express?

```
Naïve Approach (DO NOT DO):
Browser ──────[ 500 MB Video File ]──────► Express Server ──────► Storage
* Express server memory fills up; event loop blocks; other users get 504 timeouts.

Vion Direct-to-Storage Architecture:
1. Browser ──────[ JSON Metadata ]──────► Express API (Takes 10ms)
2. Express ◄────[ Signed Upload URL ]──── Supabase Storage
3. Browser ──────[ 500 MB Video File ]──► Directly to Supabase Storage Bucket!
* Express server stays 100% responsive for all other API users.
```

#### Helper Implementation:
```typescript
// backend/src/services/storageService.ts
export async function createSignedUploadUrl(
  bucket: string,
  path: string,
  options: { expiresInSeconds?: number; upsert?: boolean } = {},
): Promise<{ signedUrl: string; token: string; path: string }> {
  const client = getSupabaseClient();
  const expiresIn = options.expiresInSeconds || 3600; // 1 hour

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: options.upsert ?? false });

  if (error || !data) {
    throw new AppError("Failed to create signed upload URL", 500);
  }
  return { signedUrl: data.signedUrl, token: data.token, path };
}
```

---

## 3. Neon Serverless PostgreSQL

### Connection Strategy & Pooling
- **Connection String**: Configured in `DATABASE_URL` using SSL (`sslmode=require`).
- **Prisma Integration**: Connected through `@prisma/orm-postgres/runtime` in [`backend/src/prisma/db.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/prisma/db.ts).
- **PgBouncer Pooling**: Neon provides an integrated connection pooler. Because video transcode workers and Express instances run in separate processes, connection pooling ensures database connections are reused rather than exhausting PostgreSQL limits.

---

## 4. Redis & BullMQ Worker Architecture

Video transcoding is computationally heavy. Encoding a 10-minute video into 4 resolutions can take several minutes and utilize 100% of multiple CPU cores.

Running FFmpeg inside an Express request would cause the browser's HTTP connection to timeout after 30 seconds and freeze the API. Vion offloads this work to **BullMQ** and **Redis**.

```
┌─────────────────┐       ┌─────────────────┐       ┌────────────────────────┐
│   Express API   │       │   Redis Queue   │       │   Transcoding Worker   │
│                 │       │                 │       │                        │
│ User finalizes  ├──────►│ "transcode-123" ├──────►│ 1. Download source     │
│ upload          │       │  stored in list │       │ 2. FFprobe validate    │
│ Returns 200 OK  │       │                 │       │ 3. Extract thumbnails  │
│ in 50ms!        │       │                 │       │ 4. FFmpeg encode HLS   │
└─────────────────┘       └─────────────────┘       │ 5. Upload renditions   │
                                                    │ 6. Update DB: COMPLETED│
                                                    └────────────────────────┘
```

---

### 4.1. Core BullMQ Concepts in Vion

1. **Queue (`video-transcoding`)**: The named FIFO queue in Redis storing job descriptors.
2. **Job (`TranscodeJobData`)**: The lightweight message containing instructions:
   ```typescript
   export interface TranscodeJobData {
     uploadId: string;
     channelId: string;
     rawVideoKey: string;
     title?: string;
   }
   ```
   > **Golden Rule**: Never put video file bytes into a Redis queue job! Store only lightweight strings (IDs and storage keys).
3. **Idempotency via Deterministic Job IDs**:
   In [`backend/src/queue/videoQueue.ts#L61`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/queue/videoQueue.ts#L61), Vion sets:
   ```typescript
   const jobId = `transcode-${uploadId}`;
   await videoTranscodeQueue.add("transcode-video", jobData, { jobId });
   ```
   If a user accidentally clicks "Finalize" three times, BullMQ recognizes the duplicate `jobId` and rejects the duplicates.
4. **Bounded Concurrency**:
   In [`backend/src/worker/transcodingWorker.ts#L156`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/worker/transcodingWorker.ts#L156):
   ```typescript
   concurrency: 2
   ```
   Limits the worker to processing at most **2 videos simultaneously**, preventing CPU starvation and system freezes.
5. **Retries with Exponential Backoff**:
   Transcode jobs are configured with 3 retry attempts:
   ```typescript
   attempts: 3,
   backoff: { type: "exponential", delay: 5000 }
   ```
   If temporary storage latency or a network hiccup causes an upload to fail, BullMQ automatically waits 5s, then 10s, then 20s before failing.

---

### 4.2. Worker Lifecycle Stages
The worker ([`backend/src/worker/transcodingWorker.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/worker/transcodingWorker.ts)) executes a disciplined 7-stage pipeline:

1. **Stage 1 (Receive Job)**: Reads `uploadId`, `channelId`, `rawVideoKey`.
2. **Stage 2 (Idempotency Check)**: Checks `Upload` record in DB. If already `COMPLETED`, exits early. Otherwise, updates status to `TRANSCODING`.
3. **Stage 3 (Verify Raw Object)**: Verifies file exists in `raw-videos` bucket.
4. **Stage 4 (Inspection & Thumbnails)**: Downloads source to local temp folder; generates 3 candidate thumbnails using FFmpeg; uploads them to `thumbnails` bucket.
5. **Stage 5 (HLS Transcoding)**: Runs FFmpeg for each eligible resolution, generating 6-second segments and playlists with synchronized keyframes. Updates BullMQ job progress from 30% to 95%.
6. **Stage 6 (Database Update)**: Creates `Video` rendition rows in PostgreSQL and updates `Upload.processingStatus = 'COMPLETED'`.
7. **Stage 7 (Scratch Cleanup)**: Deletes all temporary local files in `tmp/media/upl_123` to prevent disk space leaks.

---

## 5. Local Service Management & Commands

### 5.1. Starting Redis
If running Redis locally via Docker:
```bash
# Start a lightweight Redis container
docker run -d --name vion-redis -p 6379:6379 redis:alpine

# Verify Redis is running
docker ps
```

### 5.2. Running the Background Worker
In a dedicated terminal window:
```bash
# Development mode with hot reload:
cd backend
bun run worker:dev

# Or standard execution:
bun run worker
```

### 5.3. Running the Backend API
In another terminal:
```bash
cd backend
bun run dev
```

---

## 6. What to Remember

1. **Storage Bucket Roles**: `raw-videos` is private; `processed-videos` and `thumbnails` are public.
2. **Presigned Uploads Protect Express**: Large video files are streamed straight from client to Supabase Storage; Express never buffers video payloads.
3. **Jobs Contain IDs, Not Media Bytes**: BullMQ payloads store string IDs; the worker downloads the video directly from storage.
4. **Job Idempotency**: `jobId: "transcode-${uploadId}"` prevents duplicate worker jobs if a user clicks finalize repeatedly.
5. **Bounded Concurrency**: Setting worker concurrency (e.g. `2`) prevents FFmpeg from exhausting host CPU and memory.
