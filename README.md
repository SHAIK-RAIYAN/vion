# Vion YouTube — Canonical API & Fullstack Architecture

Modern video sharing platform built with Express 5, Bun, Prisma ORM 8 RC, and Next.js 16 (Turbopack).

The API contract strictly follows [`vion_plan.md`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/vion_plan.md) with canonical `/api/v1` base paths, RESTful plural resources, and domain separation between raw uploads, published videos, transcoding, and playback.

---

## Standard Response Envelopes

### Success Response (HTTP 200 / 201)
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

### Error Response (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error explanation",
    "details": []
  }
}
```

---

## Canonical API Routes (`/api/v1`)

### 1. Authentication (`/auth`)
- `POST   /api/v1/auth/signup` — Create user account
- `POST   /api/v1/auth/signin` — Authenticate and issue JWT cookie/token
- `POST   /api/v1/auth/google` — Authenticate verified Google Identity token
- `POST   /api/v1/auth/signout` — Clear session
- `POST   /api/v1/auth/forgot-password` — Request password reset token
- `POST   /api/v1/auth/reset-password` — Set new password using token
- `GET    /api/v1/auth/me` — Current authenticated session

### 2. Users (`/users`)
- `GET    /api/v1/users/me` — Current user profile
- `PATCH  /api/v1/users/me` — Update user profile
- `DELETE /api/v1/users/me` — Delete user account
- `PATCH  /api/v1/users/me/changePassword` — Change password
- `GET    /api/v1/users/me/subscriptions` — Current user's subscribed channels

### 3. Channels (`/channels`)
- `POST   /api/v1/channels` — Create channel
- `GET    /api/v1/channels/me` — Current user's channel
- `PATCH  /api/v1/channels/me` — Update current user's channel
- `DELETE /api/v1/channels/me` — Delete channel
- `GET    /api/v1/channels/:channelId` — Public channel details
- `GET    /api/v1/channels/handle/:handle` — Public channel by handle
- `POST   /api/v1/channels/:channelId/subscription` — Subscribe to channel
- `DELETE /api/v1/channels/:channelId/subscription` — Unsubscribe from channel
- `GET    /api/v1/channels/:channelId/subscription` — Check subscription status
- `GET    /api/v1/channels/:channelId/subscribers` — List channel subscribers

### 4. Uploads (`/uploads`) — Ingest & Processing Lifecycle
- `POST   /api/v1/uploads` — Create upload session
- `POST   /api/v1/uploads/presigned-url` — Generate secure R2 presigned upload URL
- `POST   /api/v1/uploads/remote-url` — Ingest from remote video URL
- `GET    /api/v1/uploads/:uploadId` — Upload session details
- `GET    /api/v1/uploads/:uploadId/status` — Processing status & progress percentage
- `PATCH  /api/v1/uploads/:uploadId` — Update metadata before publication
- `POST   /api/v1/uploads/:uploadId/finalize` — Confirm client upload finished & queue transcoding
- `DELETE /api/v1/uploads/:uploadId` — Cancel/delete upload

### 5. Videos / Publication (`/videos`)
- `POST   /api/v1/videos` — Publish processed upload to platform
- `GET    /api/v1/videos/:videoId` — Public video playback information & view increment
- `PATCH  /api/v1/videos/:videoId` — Update metadata (title, description, visibility)
- `DELETE /api/v1/videos/:videoId` — Unpublish / soft-delete video
- `GET    /api/v1/videos/:videoId/playback` — Streaming configuration & rendition URLs
- `GET    /api/v1/videos/:videoId/manifest` — HLS manifest endpoint

#### Reactions & Social on Videos
- `PUT    /api/v1/videos/:videoId/like` — Like video
- `DELETE /api/v1/videos/:videoId/like` — Remove like
- `GET    /api/v1/videos/:videoId/like` — Reaction status & count

#### Comments on Videos
- `POST   /api/v1/videos/:videoId/comments` — Add comment
- `GET    /api/v1/videos/:videoId/comments` — Paginated video comments

#### Thumbnails on Videos
- `POST   /api/v1/videos/:videoId/thumbnails/presigned-url` — Direct thumbnail upload URL
- `POST   /api/v1/videos/:videoId/thumbnails/finalize` — Finalize thumbnail
- `GET    /api/v1/videos/:videoId/thumbnails` — List video thumbnails
- `PUT    /api/v1/videos/:videoId/thumbnail` — Set active thumbnail
- `DELETE /api/v1/videos/:videoId/thumbnails/:thumbnailId` — Delete thumbnail

### 6. Comments (`/comments`)
- `GET    /api/v1/comments/:commentId` — Comment details
- `PATCH  /api/v1/comments/:commentId` — Edit user's comment
- `DELETE /api/v1/comments/:commentId` — Delete comment

### 7. Watch History (`/history`)
- `GET    /api/v1/history` — User's paginated watch history
- `GET    /api/v1/history/:videoId` — User's progress on specific video
- `PUT    /api/v1/history/:videoId/progress` — Record/update playback timestamp
- `DELETE /api/v1/history/:videoId` — Remove video from watch history
- `DELETE /api/v1/history` — Clear full watch history

### 8. Feed & Discovery (`/feed`)
- `GET    /api/v1/feed` — Public/home video feed with pagination (`?page=...&limit=...`)

### 9. Search (`/search`)
- `GET    /api/v1/search` — Search videos and channels (`?q=...`)
- `GET    /api/v1/search/suggestions` — Search query autocomplete

### 10. Categories (`/categories`)
- `GET    /api/v1/categories` — Platform categories
- `GET    /api/v1/categories/:categoryId` — Category details

### 11. Internal Worker Transcoding (`/internal/uploads`)
- `POST   /api/v1/internal/uploads/:uploadId/process` — Worker transition to transcoding
- `POST   /api/v1/internal/uploads/:uploadId/retry` — Requeue failed transcoding
- `POST   /api/v1/internal/uploads/:uploadId/cancel` — Cancel transcoding
- `POST   /api/v1/internal/uploads/:uploadId/complete` — Worker callback on completed HLS & renditions
- `POST   /api/v1/internal/uploads/:uploadId/fail` — Worker callback on failure

### 12. Health & Observability (`/health`)
- `GET    /api/v1/health` — General health check
- `GET    /api/v1/health/live` — Process liveness
- `GET    /api/v1/health/ready` — Database readiness

---

## Running Locally

```bash
# Backend (Port 5000)
cd backend
bun install
bun run verify      # Run endpoint verification suite
bun run typecheck   # Typecheck TypeScript
bun run dev         # Start Express server

# Frontend (Port 3000)
cd frontend
bun install
bun run build       # Production build
bun run dev         # Start Next.js dev server
```