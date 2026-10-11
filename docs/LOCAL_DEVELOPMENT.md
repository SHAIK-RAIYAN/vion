# Chapter 9: Local Development & Setup Handbook

This guide walks you through setting up and running the entire Vion platform on your local machine, including the Express API server, the background transcoding worker, Redis, and the Next.js frontend.

---

## 1. Prerequisites

Before starting, ensure you have the following tools installed on your operating system:

| Tool | Recommended Version | Purpose |
| :--- | :---: | :--- |
| **Bun** | `v1.1+` | JavaScript/TypeScript runtime & package manager. |
| **FFmpeg & FFprobe** | `v6.0+` or `v7.0+` | Media analysis, thumbnail extraction, and HLS transcoding. |
| **Docker** | Latest | Running local Redis container for the transcoding queue. |
| **Git** | Latest | Version control. |

### Installing FFmpeg on Your Operating System:
- **Windows** (via WinGet or Chocolatey):
  ```powershell
  winget install Gyan.FFmpeg
  # Or via Chocolatey:
  choco install ffmpeg
  ```
- **macOS** (via Homebrew):
  ```bash
  brew install ffmpeg
  ```
- **Linux** (Ubuntu / Debian):
  ```bash
  sudo apt update && sudo apt install -y ffmpeg
  ```

#### Verify FFmpeg Installation:
In your terminal, run:
```bash
ffmpeg -version
ffprobe -version
```
If both commands print version information without errors, your media binaries are ready.

---

## 2. Repository Cloning & Dependency Installation

In your terminal:

```bash
# 1. Clone the repository
git clone https://github.com/SHAIK-RAIYAN/vion.git
cd vion

# 2. Install backend dependencies using Bun
cd backend
bun install

# 3. Install frontend dependencies using Bun
cd ../frontend
bun install
```

---

## 3. Environment Configuration

### 3.1. Backend Environment Variables (`backend/.env`)
Create a file at `backend/.env` based on the template below.

> [!CAUTION]
> **Secret Protection**: Replace all placeholder values (`<...>`) with your real credentials. **Never commit `.env` files to Git.**

```env
# Server & Runtime Configuration
PORT=5000
NODE_ENV=development
SALT_ROUNDS=10
JWT_SECRET_KEY="vion_super_secret_jwt_key_replace_in_production"
FRONTEND_URL="http://localhost:3000"

# Database Configuration (Neon PostgreSQL)
# Ensure ?sslmode=require is appended at the end of the connection string
DATABASE_URL="postgresql://neondb_owner:<NEON_PASSWORD>@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Supabase Object Storage
SUPABASE_URL="https://<YOUR_SUPABASE_PROJECT_ID>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<YOUR_SUPABASE_SERVICE_ROLE_KEY>"
SUPABASE_RAW_BUCKET="raw-videos"
SUPABASE_PROCESSED_BUCKET="processed-videos"
SUPABASE_THUMBNAILS_BUCKET="thumbnails"

# Redis Queue (BullMQ)
REDIS_URL="redis://localhost:6379"

# Media Processing Limits & Binaries
FFMPEG_PATH="ffmpeg"
FFPROBE_PATH="ffprobe"
MAX_UPLOAD_SIZE_BYTES=524288000
MAX_PROCESSING_DURATION_SECONDS=1800
```

### 3.2. Frontend Environment Variables (`frontend/.env.local`)
Create a file at `frontend/.env.local`:

```env
# Backend API Base URL
NEXT_PUBLIC_API_URL="http://localhost:5000/api/v1"
```

---

## 4. Configuring Supabase Storage Buckets

Log into your [Supabase Dashboard](https://supabase.com/dashboard) and navigate to **Storage**:

1. **Create Bucket 1: `raw-videos`**
   - Visibility: **Private** (Public bucket toggle: OFF)
   - Purpose: Holds raw uploads accessed only via signed URLs.
2. **Create Bucket 2: `processed-videos`**
   - Visibility: **Public** (Public bucket toggle: ON)
   - Purpose: Hosts `.m3u8` playlists and `.ts` media segments streamed by video players.
3. **Create Bucket 3: `thumbnails`**
   - Visibility: **Public** (Public bucket toggle: ON)
   - Purpose: Hosts `.jpg` cover posters and creator avatars.

---

## 5. Starting Local Services

You need three terminal tabs running simultaneously during local development:

### Terminal 1: Start Redis (Docker)
```bash
# Start Redis in the background
docker run -d --name vion-redis -p 6379:6379 redis:alpine

# Verify Redis is running
docker ps
```

### Terminal 2: Start Backend API Server
```bash
cd backend
bun run dev
```
*Output should show:*
```
[Vion Server] Started listening on port 5000 (development)
[Vion Server] Connected to Neon PostgreSQL database
```

### Terminal 3: Start Transcoding Worker
```bash
cd backend
bun run worker:dev
```
*Output should show:*
```
[Worker] Transcoding worker is ready and listening to queue 'video-transcoding'.
```

### Terminal 4: Start Frontend Next.js Server
```bash
cd frontend
bun run dev
```
*Output should show:*
```
▲ Next.js 16.4.0 (Turbopack)
- Local: http://localhost:3000
```

---

## 6. End-to-End Testing Walkthrough

Follow this 5-minute test to verify that the entire platform is functioning properly:

1. **Sign Up**:
   - Open `http://localhost:3000` in your browser.
   - Click **"Sign In"** $\rightarrow$ **"Sign Up"**.
   - Fill in your details (e.g. `creator@vion.tv`, `Test1234!`).
   - Confirm your channel is created.
2. **Upload a Test Video**:
   - Click the **"Upload Video"** button in the top navigation bar.
   - Select a small sample MP4 file (1–2 minutes long).
   - Enter a title and description.
   - Click **"Upload"**.
3. **Observe the Worker Console**:
   - In Terminal 3 (Worker), you will see:
     ```
     [Upload: upl_...] Processing started for "My Test Video"
     [Upload: upl_...] Running media-inspection and thumbnail generation...
     [Upload: upl_...] Starting adaptive HLS transcoding pipeline...
     [Upload: upl_...] Transcode job completed successfully. Manifest: master.m3u8 (4 renditions)
     ```
4. **Play the Video**:
   - Navigate to the home feed or your channel page.
   - Click on the newly processed video card.
   - The watch page (`/watch/[id]`) will load the HLS stream and begin playback immediately!

---

## 7. Verification & Typechecking Commands

To ensure code quality and schema synchronization, run these verified scripts:

```bash
# Check backend TypeScript types
cd backend
bun run typecheck

# Run backend schema verification
bun run verify

# Check frontend TypeScript types
cd ../frontend
bun run typecheck

# Check frontend linting
bun run lint

# Emit Prisma contract if contract.prisma was modified
cd ../backend
bun run contract:emit
```

---

## 8. What to Remember

1. **Run 3 services simultaneously**: Express API (`bun run dev`), Worker (`bun run worker:dev`), and Next.js (`bun run dev`).
2. **Redis must be running**: If Redis is down, finalizing uploads will fail with `ECONNREFUSED`.
3. **FFmpeg must be in `$PATH`**: If missing, transcoding jobs will fail during stage 9.
4. **Storage Permissions**: `raw-videos` must be private; `processed-videos` and `thumbnails` must be public.
5. **Never commit secrets**: Keep database passwords and Supabase service role keys inside untracked `.env` files.
