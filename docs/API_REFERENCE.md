# Chapter 7: API Contract & Endpoint Reference

This document serves as the canonical HTTP API reference for Vion. It maps every route planned in `vion_plan.md` directly to its Express controller, validation schema, authentication rules, and current implementation status.

---

## 1. Global API Standards

### Base URL
All API endpoints are mounted under the `/api/v1` prefix:
```
http://localhost:5000/api/v1
```

### Standard Success Response Envelope
All successful API responses return a uniform JSON format:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### Standard Error Response Envelope
When an operation fails (e.g. bad input, unauthorized access, or internal error), the centralized error handler returns:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title cannot exceed 200 characters",
    "details": [
      {
        "field": "title",
        "message": "Title cannot exceed 200 characters"
      }
    ]
  }
}
```

### Common HTTP Status Codes
| Code | Enum Name | Description |
| :---: | :--- | :--- |
| **200** | `OK` | Request succeeded; response payload returned in `data`. |
| **201** | `CREATED` | Resource successfully created (new user, upload session, comment). |
| **400** | `BAD_REQUEST` | Validation failed or malformed request syntax. |
| **401** | `UNAUTHORIZED` | Authentication missing, invalid, or expired. |
| **403** | `FORBIDDEN` | Authenticated user lacks permission to modify this resource. |
| **404** | `NOT_FOUND` | Resource ID does not exist in the database. |
| **409** | `CONFLICT` | Unique constraint violation (e.g. duplicate email or handle). |
| **413** | `PAYLOAD_TOO_LARGE` | Uploaded file size exceeds the 500 MB limit. |
| **422** | `UNPROCESSABLE_ENTITY` | Semantic error (e.g. corrupt video file, zero duration). |
| **500** | `INTERNAL_SERVER_ERROR` | Unhandled server exception. |

---

## 2. Authentication (`/api/v1/auth`)

Mounted at [`backend/src/modules/auth/auth.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/auth/auth.routes.ts).

### 2.1. `POST /api/v1/auth/signup`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Public
- **Purpose**: Registers a new user account, hashes the password via Bcrypt, and automatically creates an initial channel with a unique handle.
- **Request Body**:
  ```json
  {
    "email": "creator@vion.tv",
    "password": "SecurePassword123!",
    "firstName": "John",
    "lastName": "Doe",
    "gender": "MALE",
    "dob": "1995-05-12T00:00:00.000Z"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Account created successfully",
    "data": {
      "user": { "id": "usr_123", "email": "creator@vion.tv" },
      "channel": { "id": "chn_456", "handle": "johndoe", "channelName": "John Doe" }
    }
  }
  ```

### 2.2. `POST /api/v1/auth/signin`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Public
- **Purpose**: Validates email and password, generates a signed JWT, sets an HTTP-only cookie `token`, and returns user session info.
- **Request Body**:
  ```json
  {
    "email": "creator@vion.tv",
    "password": "SecurePassword123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully",
    "data": {
      "user": { "id": "usr_123", "email": "creator@vion.tv" },
      "token": "eyJhbGciOi..."
    }
  }
  ```

### 2.3. `POST /api/v1/auth/signout`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required
- **Purpose**: Clears the HTTP-only authentication cookie and terminates the session.
- **Response (200 OK)**:
  ```json
  { "success": true, "message": "Logged out successfully" }
  ```

### 2.4. `GET /api/v1/auth/me`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required
- **Purpose**: Returns currently authenticated user session and associated channel profile.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "user": { "id": "usr_123", "email": "creator@vion.tv", "firstName": "John" },
      "channel": { "id": "chn_456", "handle": "johndoe" }
    }
  }
  ```

---

## 3. Users (`/api/v1/users`)

Mounted at [`backend/src/modules/user/user.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/user/user.routes.ts). Guarded globally with `authMiddleware`.

### 3.1. `GET /api/v1/users/me`
- **Status**: `[IMPLEMENTED]`
- **Purpose**: Fetch detailed personal profile of the logged-in user.

### 3.2. `PATCH /api/v1/users/me`
- **Status**: `[IMPLEMENTED]`
- **Purpose**: Update first name, last name, date of birth, or gender.

### 3.3. `PATCH /api/v1/users/me/changePassword`
- **Status**: `[IMPLEMENTED]`
- **Request Body**: `{ "currentPassword": "...", "newPassword": "..." }`
- **Purpose**: Validates existing password before applying new Bcrypt hash.

### 3.4. `DELETE /api/v1/users/me`
- **Status**: `[IMPLEMENTED]`
- **Purpose**: Soft-deletes or deletes user account and associated channel.

---

## 4. Channels & Subscriptions (`/api/v1/channels`)

Mounted at [`backend/src/modules/channel/channel.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/channel/channel.routes.ts).

| Method | Endpoint | Auth | Purpose | Status |
| :--- | :--- | :---: | :--- | :---: |
| `GET` | `/api/v1/channels/:channelId` | Optional | Get public channel details and video list. | `[IMPLEMENTED]` |
| `GET` | `/api/v1/channels/handle/:handle` | Optional | Look up a channel by its `@handle`. | `[IMPLEMENTED]` |
| `PATCH`| `/api/v1/channels/me` | Required | Update channel name, description, avatar, banner. | `[IMPLEMENTED]` |
| `POST` | `/api/v1/channels/:channelId/subscription` | Required | Subscribe to channel. | `[IMPLEMENTED]` |
| `DELETE`| `/api/v1/channels/:channelId/subscription` | Required | Unsubscribe from channel. | `[IMPLEMENTED]` |
| `GET` | `/api/v1/channels/:channelId/subscription` | Required | Check if current user is subscribed (returns `{ isSubscribed: boolean }`). | `[IMPLEMENTED]` |
| `GET` | `/api/v1/channels/:channelId/subscribers` | Optional | Get subscriber count and subscriber list. | `[IMPLEMENTED]` |
| `GET` | `/api/v1/users/me/subscriptions` | Required | List all channels the current user is subscribed to. | `[IMPLEMENTED]` |

---

## 5. Upload Sessions (`/api/v1/uploads`)

Mounted at [`backend/src/modules/upload/upload.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/upload/upload.routes.ts).

### 5.1. `POST /api/v1/uploads`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required
- **Purpose**: Creates an upload draft in PostgreSQL and returns a signed Supabase Storage PUT URL.
- **Request Body**:
  ```json
  {
    "title": "Tokyo Night Walk",
    "description": "4K 60fps binaural audio walk through Shibuya.",
    "fileName": "tokyo.mp4",
    "fileSize": 250000000,
    "contentType": "video/mp4"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Upload session created successfully",
    "data": {
      "id": "upl_123",
      "uploadUrl": "https://<supabase>/storage/v1/object/upload/sign/raw-videos/...",
      "storageKey": "raw/chn_456/upl_123/tokyo.mp4"
    }
  }
  ```

### 5.2. `POST /api/v1/uploads/:uploadId/finalize`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required
- **Purpose**: Informs the backend that the browser finished uploading binary bytes. Verifies storage object exists and enqueues transcode job in BullMQ.
- **Request Body**:
  ```json
  { "storageKey": "raw/chn_456/upl_123/tokyo.mp4" }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Upload finalized. Transcoding enqueued.",
    "data": {
      "id": "upl_123",
      "processingStatus": "UPLOADING",
      "jobId": "transcode-upl_123"
    }
  }
  ```

### 5.3. `GET /api/v1/uploads/:uploadId/status`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required
- **Purpose**: Polls processing state during encoding (`PENDING`, `UPLOADING`, `TRANSCODING`, `COMPLETED`, `FAILED`).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "upl_123",
      "processingStatus": "TRANSCODING",
      "progress": 65,
      "hlsManifestUrl": null
    }
  }
  ```

---

## 6. Videos & Playback (`/api/v1/videos`)

Mounted at [`backend/src/modules/video/video.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/video/video.routes.ts).

### 6.1. `GET /api/v1/videos/:videoId`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Optional
- **Purpose**: Retrieves public video details, channel branding, view count, like count, and HLS manifest URL. Enforces visibility checks (`PRIVATE` videos return 403 unless requested by channel owner).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "upl_123",
      "title": "Tokyo Night Walk",
      "description": "4K walk through Shibuya.",
      "hlsManifestUrl": "https://<supabase>/storage/v1/object/public/processed-videos/.../master.m3u8",
      "thumbnailUrl": "https://<supabase>/storage/v1/object/public/thumbnails/.../default.jpg",
      "viewCount": 1420,
      "visibility": "PUBLIC",
      "channel": {
        "id": "chn_456",
        "channelName": "City Walks",
        "handle": "citywalks"
      },
      "likesCount": 85,
      "userReaction": "LIKE"
    }
  }
  ```

### 6.2. `GET /api/v1/videos/:videoId/playback`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Optional
- **Purpose**: Returns streaming configuration for the video player: master playlist URL, available resolutions, and poster image.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "manifestUrl": "https://<supabase>/storage/v1/object/public/processed-videos/.../master.m3u8",
      "thumbnailUrl": "https://<supabase>/storage/v1/object/public/thumbnails/.../default.jpg",
      "renditions": ["1080p", "720p", "480p", "360p"]
    }
  }
  ```

### 6.3. `PATCH /api/v1/videos/:videoId`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required (Owner only)
- **Purpose**: Updates title, description, or visibility (`PUBLIC`, `PRIVATE`, `UNLISTED`).

### 6.4. `DELETE /api/v1/videos/:videoId`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Required (Owner only)
- **Purpose**: Soft-deletes video by setting `isDeleted = true`.

---

## 7. Reactions & Comments

### 7.1. Likes (`/api/v1/videos/:videoId/like`)
- `PUT /api/v1/videos/:videoId/like`: Casts a `LIKE` reaction. `[IMPLEMENTED]`
- `DELETE /api/v1/videos/:videoId/like`: Removes the reaction. `[IMPLEMENTED]`
- `GET /api/v1/videos/:videoId/like`: Checks current reaction (`{ hasLiked: boolean, reaction: "LIKE" | null }`). `[IMPLEMENTED]`

### 7.2. Comments (`/api/v1/videos/:videoId/comments`)
- `POST /api/v1/videos/:videoId/comments`: Posts a new comment. `[IMPLEMENTED]`
- `GET /api/v1/videos/:videoId/comments`: Paginated comment list with author details (`?page=1&limit=20`). `[IMPLEMENTED]`
- `PATCH /api/v1/comments/:commentId`: Edits comment content (Author only). `[IMPLEMENTED]`
- `DELETE /api/v1/comments/:commentId`: Deletes comment (Author or Video Owner). `[IMPLEMENTED]`

---

## 8. Watch History (`/api/v1/history`)

Mounted at [`backend/src/modules/watchHistory/watchHistory.routes.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/backend/src/modules/watchHistory/watchHistory.routes.ts). Guarded with `authMiddleware`.

| Method | Endpoint | Purpose | Status |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/history` | Paginated list of videos watched by user. | `[IMPLEMENTED]` |
| `GET` | `/api/v1/history/:videoId` | Get progress timestamp (in seconds) for resume playback. | `[IMPLEMENTED]` |
| `PUT` | `/api/v1/history/:videoId/progress` | Update current playback progress (`{ progressTimeStamp: 145 }`). | `[IMPLEMENTED]` |
| `DELETE`| `/api/v1/history/:videoId` | Remove single video from history. | `[IMPLEMENTED]` |
| `DELETE`| `/api/v1/history` | Clear entire watch history. | `[IMPLEMENTED]` |

---

## 9. Discovery & Navigation: Feed & Search

### 9.1. Feed (`/api/v1/feed`)
- `GET /api/v1/feed`: Returns home page video feed (`visibility = 'PUBLIC'`, `processingStatus = 'COMPLETED'`, `isDeleted = false`). Supports pagination (`?page=1&limit=12`). `[IMPLEMENTED]`

### 9.2. Search (`/api/v1/search`)
- `GET /api/v1/search?q=tokyo`: Full-text search across video titles and channel descriptions. `[IMPLEMENTED]`
- `GET /api/v1/search/suggestions?q=tok`: Autocomplete suggestions. `[PARTIALLY IMPLEMENTED]`

---

## 10. Health & Internal Routes

### 10.1. `GET /api/v1/health`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Public
- **Purpose**: System diagnostics check. Returns database connectivity, storage status, and Redis connection state.

### 10.2. `POST /api/v1/internal/uploads/:uploadId/retry`
- **Status**: `[IMPLEMENTED]`
- **Auth**: Service-to-service / Admin
- **Purpose**: Requeues a failed video transcode job directly in BullMQ.

---

## 11. What to Remember

1. **Standard Envelopes**: Every endpoint responds with `{ success: true, data: ... }` or `{ success: false, error: ... }`.
2. **Deterministic Status Codes**: 201 for creation, 200 for updates/lookups, 400 for validation errors, 401 for unauthenticated, 403 for unauthorized, 404 for missing records.
3. **`Upload` is the Single Source of Truth**: Video playback (`GET /api/v1/videos/:id`) and upload sessions (`GET /api/v1/uploads/:id`) read from the same `Upload` table in PostgreSQL.
4. **Visibility Rules**: Private videos are never returned to unauthenticated users or users who do not own the channel.
