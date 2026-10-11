# 🎬 Vion — Full-Stack Video Sharing & Adaptive Streaming Platform

Welcome to **Vion** — an open-source, production-grade video-sharing and adaptive streaming platform built from the ground up with modern full-stack web technologies.

Vion delivers a YouTube-like experience featuring direct-to-cloud uploads, distributed video transcoding with FFmpeg, adaptive bitrate streaming (HLS), channel management, subscriptions, watch history, real-time reactions, comments, and responsive UI micro-interactions.

---

## 📑 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [Technology Stack](#-technology-stack)
- [Core Concepts Explained for Beginners](#-core-concepts-explained-for-beginners)
  - [1. Database Architecture (PostgreSQL & Prisma)](#1-database-architecture-postgresql--prisma)
  - [2. Storage Architecture (Supabase Storage)](#2-storage-architecture-supabase-storage)
  - [3. Queue & Background Processing (Redis & BullMQ)](#3-queue--background-processing-redis--bullmq)
  - [4. Video Transcoding & HLS Streaming (FFmpeg)](#4-video-transcoding--hls-streaming-ffmpeg)
  - [5. Automated Thumbnail Generation](#5-automated-thumbnail-generation)
- [The End-to-End Video Lifecycle](#-the-end-to-end-video-lifecycle)
- [Project Directory Structure](#-project-directory-structure)
- [Quickstart & Local Development](#-quickstart--local-development)
  - [Prerequisites](#prerequisites)
  - [Environment Variables Configuration](#environment-variables-configuration)
  - [Option A: Running Locally with Bun](#option-a-running-locally-with-bun)
  - [Option B: Running with Docker Compose](#option-b-running-with-docker-compose)
- [Testing & Quality Verification](#-testing--quality-verification)
- [Canonical API Reference](#-canonical-api-reference)
- [Deep Dive Documentation](#-deep-dive-documentation)

---

## 🏛 Architectural Overview

Vion is organized into decoupled services that communicate through HTTP APIs, direct object storage transfers, and an asynchronous Redis message queue:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Next.js 16 Web Frontend                           │
│   (App Router, React 19, Tailwind CSS v4, GSAP Animations, Hls.js)    │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ Direct Upload                 │ API Requests
                │ (Signed PUT URL)              │ (JSON / Cookies)
                ▼                               ▼
    ┌──────────────────────┐        ┌──────────────────────┐
    │   SUPABASE STORAGE   │        │     EXPRESS 5 API    │
    │  - raw-videos        │        │      (Bun Runtime)   │
    │  - processed-videos  │        │   Prisma ORM 8 RC    │
    │  - thumbnails        │        └──────────┬───────────┘
    └──────────▲───────────┘                   │
               │                               │ Enqueue Transcode Job
               │ Download raw /                │ (BullMQ)
               │ Upload HLS & posters          ▼
    ┌──────────┴───────────┐        ┌──────────────────────┐
    │  TRANSCODING WORKER  │◄───────┤     REDIS QUEUE      │
    │   (FFmpeg + Bun)     │ Polls  │   (video-transcoding)│
    └──────────┬───────────┘        └──────────────────────┘
               │
               │ Status Updates & Rendition Metadata
               ▼
    ┌──────────────────────┐
    │   NEON POSTGRESQL    │
    │  (Relational Database│
    └──────────────────────┘
```

---

## 🧰 Technology Stack

| Layer | Technology | Purpose & Why It Was Chosen |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16 (App Router) | Server-side rendering, SEO-friendly video landing pages, fast client transitions via Turbopack. |
| **Styling & UI** | Tailwind CSS v4 & shadcn/ui | High-performance CSS utility engine with modern design system and accessible dialogs, dropdowns, and drawers. |
| **Animations** | GSAP 3 | Butter-smooth micro-animations, layout entrance choreography, and dynamic search palette transitions. |
| **Video Player** | Hls.js & Native HTML5 | Seamless adaptive streaming playback supporting automatic quality switching and buffer management. |
| **Backend Runtime** | Bun & Express 5 | Ultra-fast JavaScript runtime paired with Express 5's modern async middleware and routing pipeline. |
| **Database** | PostgreSQL (Neon) | ACID-compliant relational storage for users, channels, comments, watch progress, and video metadata. |
| **ORM** | Prisma ORM 8 RC | Type-safe database queries, schema migrations, and connection management. |
| **Object Store** | Supabase Storage | S3-compatible cloud object storage configured into isolated buckets for raw ingest, HLS assets, and posters. |
| **Job Queue** | BullMQ & Redis 7 | Distributed, persistent background queue isolating CPU-heavy video encoding from the web API. |
| **Media Processing**| FFmpeg & FFprobe | High-performance CLI tools for container inspection, frame extraction, and adaptive multi-bitrate HLS encoding. |
| **Containerization**| Docker & Docker Compose | Multi-stage, production-ready container definitions for local development and cloud deployments. |

---

## 💡 Core Concepts Explained for Beginners

If you are new to video infrastructure and backend engineering, here is how each component works and why it is structured this way:

### 1. Database Architecture (PostgreSQL & Prisma)

In a video platform, **uploading** a file is fundamentally different from **publishing** a video:
- **`Upload` Model**: Represents an ingestion session. When you pick a file on your device, an `Upload` record is created in status `PENDING` or `UPLOADING`. It stores the temporary storage key, file size, and background transcoding progress (`0%` to `100%`).
- **`Video` Model**: Represents a public or unlisted video live on the platform. A video only exists once transcoding completes and the creator clicks "Publish", providing a title, description, category, and visibility.
- **`VideoRendition` Model**: One video can have multiple resolutions (e.g. 1080p, 720p, 480p, 360p). Each rendition records its width, height, bitrate, and playlist path.
- **Social Graph Models**: `Channel`, `Subscription`, `Interaction` (Like/Dislike), `Comment`, `WatchHistory`, and `View` models form the relational core of the platform.

### 2. Storage Architecture (Supabase Storage)

Vion organizes media into **three dedicated Supabase Storage buckets**:

1. **`raw-videos` (Private)**:
   - Contains the original video files uploaded by creators (e.g. `raw/{channelId}/{uploadId}/{uuid}.mp4`).
   - Kept strictly private so unauthorized users cannot download raw unprocessed masters.
   - The browser uploads directly using a **short-lived signed URL** (`createSignedUploadUrl`). The video bytes never pass through the Express server!
2. **`processed-videos` (Public)**:
   - Stores the generated HLS playlists (`master.m3u8`, `1080p.m3u8`, `720p.m3u8`) and segmented video chunks (`seg-0001.ts`).
   - Publicly accessible via CDN so video players around the world can stream segments rapidly.
3. **`thumbnails` (Public)**:
   - Stores custom channel banners, user avatars, and auto-generated video posters (`.webp`).

#### Why Direct Uploads?
Video files can be hundreds of megabytes or gigabytes in size. If the browser streamed video files through Express, the Node/Bun server would waste CPU, exhaust memory buffers, and choke network bandwidth. By minting a cryptographic signed PUT URL, the browser sends raw bytes straight to cloud storage, keeping the API fast and responsive.

### 3. Queue & Background Processing (Redis & BullMQ)

Transcoding a 4K or 1080p video takes several minutes and requires 100% of available CPU cores. If Express ran this inside an HTTP request, the connection would time out and the entire web server would freeze.

Instead, Vion uses **BullMQ** and **Redis**:
1. When the client finishes uploading, it calls `POST /api/v1/uploads/:uploadId/finalize`.
2. Express verifies that the file exists in storage and drops a lightweight task into the Redis queue named `video-transcoding`.
3. Express responds immediately with `200 OK` (the client is never blocked).
4. A dedicated background **Worker** process picks up the job from Redis, runs FFmpeg, and reports live progress (`10%`, `35%`, `70%`, `100%`).
5. If the worker encounters a transient error, BullMQ automatically retries with exponential backoff.

### 4. Video Transcoding & HLS Streaming (FFmpeg)

Why don't we just play the uploaded `.mp4` file directly?
- **Different Devices & Connections**: A viewer on fiber internet wants crystal-clear 1080p; a viewer on mobile data needs a lightweight 360p or 480p stream to prevent buffering.
- **Apple HLS (HTTP Live Streaming)**: HLS is the industry standard for video on the web. FFmpeg breaks the video into small 4-second fragments (`.ts` files) and creates an index file (`master.m3u8`).
- **Adaptive Bitrate Streaming (ABR)**: The video player continuously measures the viewer's download speed. If the network slows down, the player automatically switches down from `1080p.m3u8` to `480p.m3u8` on the very next 4-second chunk—without stopping or stuttering!
- **Anti-Upscaling**: If a creator uploads a 720p video, Vion will never waste compute creating a fake 1080p rendition. It only transcodes renditions up to the source video's native resolution.

### 5. Automated Thumbnail Generation

When a video arrives:
1. Before heavy encoding starts, **FFprobe** inspects the video container in milliseconds to check dimensions, duration, and codec health.
2. **FFmpeg** extracts a crisp frame snapshot at timestamp `00:00:01` and compresses it into modern `.webp` format.
3. The thumbnail is uploaded to the public `thumbnails` bucket and attached to the upload record, allowing cards and previews to render instantly.

---

## 🔄 The End-to-End Video Lifecycle

```
[1] User selects video file in Frontend Studio Dialog
     │
[2] Frontend requests signed upload URL:
    POST /api/v1/uploads/presigned-url  ──> Express returns Supabase Signed URL
     │
[3] Frontend PUTs video bytes directly to Supabase Storage:
    PUT https://<project>.supabase.co/storage/v1/object/upload/sign/raw-videos/...
     │
[4] Frontend confirms upload completion:
    POST /api/v1/uploads/:id/finalize   ──> Express verifies object in storage
                                            ──> Enqueues job to Redis BullMQ
     │
[5] Background Worker picks up job:
    ──> Probes video with FFprobe
    ──> Extracts 00:00:01 thumbnail and uploads to `thumbnails`
    ──> Transcodes adaptive HLS renditions (1080p, 720p, 480p, 360p)
    ──> Uploads HLS segments & master.m3u8 to `processed-videos`
    ──> Updates database status to `COMPLETED`
     │
[6] Creator fills title & description, then publishes:
    POST /api/v1/videos                 ──> Creates published Video entity
     │
[7] Viewer opens /watch/:id:
    GET /api/v1/videos/:id              ──> Returns playback URL & metadata
    Hls.js streams `master.m3u8` with seamless adaptive bitrate switching!
```

---

## 📂 Project Directory Structure

```
vion/
├── backend/                    # Express 5 API & Transcoding Worker
│   ├── src/
│   │   ├── config/             # Environment, Redis, and Supabase config
│   │   ├── middleware/         # Auth, validation, error handler, CORS
│   │   ├── modules/            # Domain modules (auth, video, upload, comments, history)
│   │   ├── prisma/             # Prisma client & temporal polyfill
│   │   ├── queue/              # BullMQ queue producer & configuration
│   │   ├── services/           # StorageService, MediaService, TranscodingService
│   │   └── worker/             # TranscodingWorker process entry point
│   ├── prisma/                 # schema.prisma & database migrations
│   ├── Dockerfile              # Multi-stage Docker image for Express API
│   ├── Dockerfile.worker       # Multi-stage Docker image for FFmpeg Worker
│   └── package.json            # Bun package definition
│
├── frontend/                   # Next.js 16 App Router Web Application
│   ├── src/
│   │   ├── app/                # App Router pages (feed, watch, studio, channel, history)
│   │   ├── components/         # React components (navigation, video player, studio dialog)
│   │   ├── context/            # Authentication & UI state
│   │   ├── hooks/              # Custom React hooks (debounce, upload, media query)
│   │   ├── lib/                # Axios API client, GSAP config, utilities
│   │   └── types/              # TypeScript interfaces for API contracts
│   ├── Dockerfile              # Multi-stage standalone Next.js Docker image
│   └── package.json            # Frontend package definition
│
├── docs/                       # 10-Chapter In-Depth Technical Handbook
├── docker-compose.yml          # Full-stack multi-container orchestration
└── README.md                   # This handbook
```

---

## 🚀 Quickstart & Local Development

### Prerequisites

Ensure you have the following installed on your machine:
- **[Bun](https://bun.sh/)** (v1.1+ recommended) or Node.js (v20+)
- **[Docker & Docker Compose](https://www.docker.com/)** (for Redis and containerized runs)
- **[FFmpeg & FFprobe](https://ffmpeg.org/)** (v5.0+ installed and added to your system `PATH`)

---

### Environment Variables Configuration

Create `.env` files in both `backend/` and `frontend/`.

#### 1. Backend (`backend/.env`)
```bash
# Server Port & Environment
PORT=5000
NODE_ENV=development
API_BASE_URL=http://localhost:5000

# PostgreSQL (Neon or local PostgreSQL)
DATABASE_URL="postgresql://user:password@ep-cool-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Authentication & Sessions
JWT_SECRET=super-secret-jwt-key-min-32-chars-long
JWT_EXPIRES_IN=7d
COOKIE_SECRET=super-secret-cookie-signing-key

# Redis (for BullMQ queue)
REDIS_URL=redis://localhost:6379

# Supabase Storage Credentials
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
SUPABASE_RAW_BUCKET=raw-videos
SUPABASE_PROCESSED_BUCKET=processed-videos
SUPABASE_THUMBNAILS_BUCKET=thumbnails

# Worker execution (set to true to run worker embedded with API server in dev)
ENABLE_WORKER=true
```

#### 2. Frontend (`frontend/.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_STORAGE_URL=https://your-project-ref.supabase.co/storage/v1/object/public
```

---

### Option A: Running Locally with Bun

#### 1. Start Redis
You can start a lightweight Redis container via Docker:
```bash
docker run -d --name vion-redis -p 6379:6379 redis:7-alpine
```

#### 2. Start the Backend API & Transcoding Worker
```bash
cd backend
bun install

# Generate Prisma Client & Run Migrations
bunx prisma generate
bunx prisma migrate dev

# Run the API server with embedded worker
bun run dev
```
> The backend server will be listening at `http://localhost:5000`.

#### 3. Start the Frontend
```bash
cd frontend
bun install
bun run dev
```
> Open your browser at `http://localhost:3000` to start using Vion!

---

### Option B: Running with Docker Compose

To start the entire Vion stack (Redis, Backend API, Transcoding Worker with FFmpeg, and Next.js Frontend) in a single command:

```bash
docker compose up --build
```

- **Frontend**: Accessible at `http://localhost:3000`
- **Backend API**: Accessible at `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/v1/health`
- **Worker**: Runs in the background with FFmpeg installed and monitors the `video-transcoding` Redis queue.

To run in detached mode:
```bash
docker compose up -d
```
To stop the stack:
```bash
docker compose down
```

---

## 🧪 Testing & Quality Verification

Vion includes comprehensive test suites, strict TypeScript types, and validation gates:

```bash
# 1. Run Backend Unit & Integration Tests (80+ test cases)
cd backend
bun test

# 2. Typecheck Backend
cd backend
bun run typecheck

# 3. Typecheck Frontend
cd frontend
bun run typecheck

# 4. Verify Frontend Production Build
cd frontend
bun run build

# 5. Verify Docker Compose Configuration
docker compose config
```

---

## 📡 Canonical API Reference

All backend routes are mounted under `/api/v1` and follow standard JSON envelopes:

### Standard Success Response:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### Standard Error Response:
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested video could not be found.",
    "details": []
  }
}
```

### Core Endpoints Overview

| Domain | Method & Endpoint | Description |
| :--- | :--- | :--- |
| **Auth** | `POST /api/v1/auth/signup` | Register a new user |
| | `POST /api/v1/auth/signin` | Sign in and receive JWT auth cookie |
| | `POST /api/v1/auth/signout` | Invalidate current session |
| | `GET  /api/v1/auth/me` | Retrieve current authenticated user |
| **Channels** | `POST /api/v1/channels` | Create a user channel |
| | `GET  /api/v1/channels/:id` | View public channel and subscriber count |
| | `POST /api/v1/channels/:id/subscription` | Subscribe / unsubscribe |
| **Uploads** | `POST /api/v1/uploads` | Initiate upload session |
| | `POST /api/v1/uploads/presigned-url` | Obtain signed direct Supabase upload PUT URL |
| | `POST /api/v1/uploads/:id/finalize` | Verify storage object and trigger transcoding |
| | `GET  /api/v1/uploads/:id/status` | Real-time transcoding progress and queue state |
| **Videos** | `POST /api/v1/videos` | Publish a completed upload |
| | `GET  /api/v1/videos/:id` | Video player metadata and view counter |
| | `GET  /api/v1/feed` | Paginated home video feed |
| | `PUT  /api/v1/videos/:id/like` | Like or remove like on a video |
| | `POST /api/v1/videos/:id/comments` | Add comment to a video |
| **History** | `GET  /api/v1/history` | Paginated user watch history |
| | `PUT  /api/v1/history/:id/progress` | Sync playback timestamp progress |
| **Health** | `GET  /api/v1/health` | Service liveness and database readiness |

---

## 📖 Deep Dive Documentation

For in-depth architectural deep dives, step-by-step guides, and engineering decisions, explore the complete 10-chapter handbook located in the [`docs/`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/README.md) directory:

1. **[Chapter 1: Project Overview & Systems Architecture](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/PROJECT_OVERVIEW.md)**
2. **[Chapter 2: Backend Architecture & Request Flow](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/BACKEND_ARCHITECTURE.md)**
3. **[Chapter 3: Database Design & Prisma ORM](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/DATABASE_AND_PRISMA.md)**
4. **[Chapter 4: Video Upload & Processing Pipeline](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/VIDEO_UPLOAD_AND_PROCESSING.md)**
5. **[Chapter 5: Video Engineering, Codecs, FFmpeg & HLS Playback](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/VIDEO_FORMATS_THUMBNAILS_AND_PLAYBACK.md)**
6. **[Chapter 6: Cloud Storage, Redis & BullMQ Workers](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/STORAGE_QUEUE_AND_WORKERS.md)**
7. **[Chapter 7: Canonical API Specification](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/API_REFERENCE.md)**
8. **[Chapter 8: Security Defenses, SSRF & Debugging Manual](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/SECURITY_FAILURES_AND_DEBUGGING.md)**
9. **[Chapter 9: Local Development & Production Deployment](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/LOCAL_DEVELOPMENT.md)**
10. **[Chapter 10: Frontend Architecture & GSAP Micro-Interactions](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/docs/FRONTEND_OVERVIEW.md)**

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/LICENSE) file for details.