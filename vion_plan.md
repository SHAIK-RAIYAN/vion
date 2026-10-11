VION
Base URL: /api/v1

IMPLEMENTATION ORDER
1. AUTH
2. USERS
3. CHANNELS
4. UPLOADS
5. VIDEOS / PUBLICATION
6. TRANSCODING
7. PLAYBACK
8. SUBSCRIPTIONS
9. COMMENTS / REACTIONS
10. WATCH HISTORY
11. FEED
12. SEARCH
13. NOTIFICATIONS
14. ADMIN
15. HEALTH / OBSERVABILITY


==================================================
1. AUTH
==================================================

POST   /api/v1/auth/signup - DONE✅
       — Create a new user account and initial channel.

POST   /api/v1/auth/signin - DONE✅
       — Authenticate user and issue auth credentials.

POST   /api/v1/auth/signout - DONE✅	
       — End/invalidate the current session.

POST   /api/v1/auth/forgot-password 
       — Start the password reset flow.

POST   /api/v1/auth/reset-password
       — Set a new password using a valid reset token.

GET    /api/v1/auth/me
       — Return the currently authenticated user's auth/session information.


==================================================
2. USERS
==================================================

GET    /api/v1/users/me  - DONE✅
       — Get the authenticated user's profile.

PATCH  /api/v1/users/me  - DONE✅
       — Update the authenticated user's profile.

DELETE /api/v1/users/me  - DONE✅
       — Delete or deactivate the authenticated user's account.

PATCH  /api/v1/users/me/changePassword - DONE✅
       — Change the authenticated user's password.


==================================================
3. CHANNELS
==================================================

POST   /api/v1/channels
       — Create a new channel.

GET    /api/v1/channels/:channelId
       — Get a channel by its ID.

GET    /api/v1/channels/handle/:handle
       — Get a public channel using its unique handle.

PATCH  /api/v1/channels/me
       — Update the authenticated user's own channel.

DELETE /api/v1/channels/me
       — Delete or deactivate the authenticated user's own channel.


==================================================
4. SUBSCRIPTIONS
==================================================

POST   /api/v1/channels/:channelId/subscription
       — Subscribe the current user to a channel.

DELETE /api/v1/channels/:channelId/subscription
       — Unsubscribe the current user from a channel.

GET    /api/v1/channels/:channelId/subscription
       — Check whether the current user is subscribed.

GET    /api/v1/channels/:channelId/subscribers
       — Get the subscribers of a channel.

GET    /api/v1/users/me/subscriptions
       — Get channels subscribed to by the current user.


==================================================
5. UPLOADS
==================================================

POST   /api/v1/uploads
       — Create a new upload record/session.

POST   /api/v1/uploads/presigned-url
       — Generate a secure Cloudflare R2 presigned upload URL.

POST   /api/v1/uploads/remote-url
       — Create an upload from an approved remote video URL.

GET    /api/v1/uploads/:uploadId
       — Get complete upload information.

GET    /api/v1/uploads/:uploadId/status
       — Get upload/transcoding status and progress.

PATCH  /api/v1/uploads/:uploadId
       — Update upload metadata before publication.

POST   /api/v1/uploads/:uploadId/finalize
       — Confirm the raw upload completed successfully.

DELETE /api/v1/uploads/:uploadId
       — Cancel or delete an upload.


==================================================
6. VIDEOS / PUBLICATION
==================================================

POST   /api/v1/videos
       — Create/publish a video from a successfully processed upload.

GET    /api/v1/videos/:videoId
       — Get complete public video information.

PATCH  /api/v1/videos/:videoId
       — Update video metadata such as title, description, visibility, tags, etc.

DELETE /api/v1/videos/:videoId
       — Delete or unpublish a video.


==================================================
7. TRANSCODING / PROCESSING
==================================================

POST   /api/v1/uploads/:uploadId/finalize
       — Confirm upload completion and trigger processing.

GET    /api/v1/uploads/:uploadId/status
       — Return processing state, percentage, errors, and job information.

POST   /api/v1/internal/uploads/:uploadId/process
       — Internal endpoint to start/requeue transcoding.

POST   /api/v1/internal/uploads/:uploadId/retry
       — Internal endpoint to retry a failed processing job.

POST   /api/v1/internal/uploads/:uploadId/cancel
       — Internal endpoint to cancel processing.

POST   /api/v1/internal/uploads/:uploadId/complete
       — Internal worker callback to report successful processing.

POST   /api/v1/internal/uploads/:uploadId/fail
       — Internal worker callback to report processing failure.

NOTE:
Internal processing routes must not be exposed as normal user APIs.
Protect them with service-to-service authentication.


==================================================
8. PLAYBACK
==================================================

GET    /api/v1/videos/:videoId/playback
       — Return playback configuration and streaming information.

GET    /api/v1/videos/:videoId/manifest
       — Return/access the HLS manifest for adaptive streaming.


==================================================
9. REACTIONS
==================================================

PUT    /api/v1/videos/:videoId/like
       — Like a video for the current user.

DELETE /api/v1/videos/:videoId/like
       — Remove the current user's like.

GET    /api/v1/videos/:videoId/like
       — Check whether the current user liked the video.


==================================================
10. COMMENTS
==================================================

POST   /api/v1/videos/:videoId/comments
       — Create a new comment on a video.

GET    /api/v1/videos/:videoId/comments
       — Get paginated comments for a video.

GET    /api/v1/comments/:commentId
       — Get a specific comment.

PATCH  /api/v1/comments/:commentId
       — Edit a comment owned by the current user.

DELETE /api/v1/comments/:commentId
       — Delete a comment.


==================================================
11. WATCH HISTORY
==================================================

GET    /api/v1/history
       — Get the current user's watch history.

GET    /api/v1/history/:videoId
       — Get the user's progress for a specific video.

PUT    /api/v1/history/:videoId/progress
       — Create or update playback progress for a video.

DELETE /api/v1/history/:videoId
       — Remove a specific video from watch history.

DELETE /api/v1/history
       — Clear the user's entire watch history.


==================================================
12. FEED
==================================================

GET    /api/v1/feed
       — Return the user's personalized/home video feed.

       Supports pagination such as:
       ?cursor=...
       &limit=20


==================================================
13. SEARCH
==================================================

GET    /api/v1/search
       — Search videos, channels, or other supported content.

GET    /api/v1/search/suggestions
       — Return autocomplete/search suggestions.


==================================================
14. THUMBNAILS
==================================================

POST   /api/v1/videos/:videoId/thumbnails/presigned-url
       — Generate a secure R2 thumbnail upload URL.

POST   /api/v1/videos/:videoId/thumbnails/finalize
       — Confirm thumbnail upload completion.

GET    /api/v1/videos/:videoId/thumbnails
       — Get all thumbnails associated with a video.

PUT    /api/v1/videos/:videoId/thumbnail
       — Set/select the active thumbnail.

DELETE /api/v1/videos/:videoId/thumbnails/:thumbnailId
       — Delete a specific thumbnail.


==================================================
15. CATEGORIES
==================================================

GET    /api/v1/categories
       — Get all available video categories.

GET    /api/v1/categories/:categoryId
       — Get details for a specific category.


==================================================
16. NOTIFICATIONS
==================================================

GET    /api/v1/notifications
       — Get the authenticated user's notifications.

GET    /api/v1/notifications/unread-count
       — Get the number of unread notifications.

PATCH  /api/v1/notifications/:notificationId/read
       — Mark one notification as read.

PATCH  /api/v1/notifications/read-all
       — Mark all notifications as read.

DELETE /api/v1/notifications/:notificationId
       — Delete a notification.


==================================================
17. ADMIN — PROTECTED ADMIN ONLY
==================================================

GET    /api/v1/admin/users
       — List and search users.

GET    /api/v1/admin/users/:userId
       — Get detailed user information.

PATCH  /api/v1/admin/users/:userId
       — Modify user account/admin-controlled fields.

DELETE /api/v1/admin/users/:userId
       — Suspend/delete a user account.

GET    /api/v1/admin/videos
       — List/search/manage platform videos.

GET    /api/v1/admin/videos/:videoId
       — Get detailed video administration information.

PATCH  /api/v1/admin/videos/:videoId
       — Moderate or modify a video.

DELETE /api/v1/admin/videos/:videoId
       — Remove a video from the platform.

GET    /api/v1/admin/reports
       — List user/content reports.

GET    /api/v1/admin/reports/:reportId
       — Get a specific report.

PATCH  /api/v1/admin/reports/:reportId
       — Resolve/update a report.

DELETE /api/v1/admin/reports/:reportId
       — Delete/remove a report.


==================================================
18. HEALTH / OBSERVABILITY
==================================================

GET    /api/v1/health
       — General application health check.

GET    /api/v1/health/live
       — Check whether the API process is alive.

GET    /api/v1/health/ready
       — Check whether the API is ready to receive traffic.


==================================================
IMPORTANT DOMAIN SEPARATION
==================================================

UPLOAD
— Temporary ingest/processing resource.
— Represents raw uploaded content and its processing lifecycle.

VIDEO
— Actual platform content.
— Represents the publishable/public video.

TRANSCODING
— Background processing lifecycle.
— Converts raw video into HLS/MP4/etc.

PLAYBACK
— Client-facing streaming access.
— Uses processed assets/CDN/R2.

Therefore:

/uploads/:uploadId
and
/videos/:videoId

must remain separate resources.


==================================================
STANDARD API BEHAVIOR
==================================================

SUCCESS RESPONSE:

{
  "success": true,
  "data": {}
}


ERROR RESPONSE:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}


COMMON STATUS CODES:

200 — Successful request
201 — Resource created
202 — Request accepted for async processing
204 — Successful request with no body
400 — Invalid/malformed request
401 — Authentication required/failed
403 — Authenticated but unauthorized
404 — Resource not found
409 — Resource/state conflict
422 — Semantically invalid input
429 — Rate limit exceeded
500 — Unexpected server error


==================================================
CORE RULE
==================================================

Every route must have clearly defined:

Authentication
Authorization
Request params
Query parameters
Request body
Validation
Database operations
Response schema
HTTP status codes
Error codes
Pagination where applicable
Caching where applicable
Rate limiting where applicable
Transaction requirements where applicable
Idempotency/concurrency requirements where applicable
Logging/observability requirements
Tests


IMPLEMENTATION ORDER:

01. AUTH
02. USERS
03. CHANNELS
04. UPLOADS
05. VIDEOS / PUBLICATION
06. TRANSCODING
07. PLAYBACK
08. SUBSCRIPTIONS
09. COMMENTS / REACTIONS
10. WATCH HISTORY
11. FEED
12. SEARCH
13. NOTIFICATIONS
14. ADMIN
15. HEALTH / OBSERVABILITY









Youtube Clone Project

1. signin signup
2. every user has a channel
3. user can upload videos on channel
	a. user simply give the video URL; store in db
	b. or user upload a video by dragging the video on website

4. Thumbnails (store images)
5. Private/unlisted/public videos
6. likes, comments
7. MAIN - Recommendations ?
	a. every user sees the same feed
	b. personalized recommendations ( maybe create recommendation systems using ML for each user)
8. watch history
9. Subscriptions
10. Search 
	a. based on title
	b. semantic search - based on subtitles or video content
11. subtitles 
	a. upload srt file
	b. auto generate subtitle (openai whisper)

12. video quality - user only upload 1 quality and we transcode it into diff qualities - also check automatic bit rate 



Tables : (Learn 1 many relationships, Prisma Transactions) 
Users 
channel
subscriptions
uploads (videoType - private,public, unlisted) (likesCount, views, deleted : true/false (dont delete actual video)
Likes
watchHistory (watchedAt time)
comments





schema : 

model User {
  id             String         @id @default(uuid())
  email          String         @unique
  passwordHash   String
  firstName      String
  lastName       String
  gender         String?
  dob            DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  
  channel        Channel?
  interactions   Interaction[]
  comments       Comment[]
  watchHistory   WatchHistory[]
  subscriptions  Subscription[]
}


model Channel {
  id                String         @id @default(uuid())
  userId            String         @unique
  handle            String         @unique
  channelName       String
  bannerUrl         String?
  profilePictureUrl String?
  description       String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  user              User           @relation(fields: [userId], references: [id])
  uploads           Upload[]
  subscribers       Subscription[]
}

model Subscription {
  id           String   @id @default(uuid())
  subscriberId String
  channelId    String
  createdAt    DateTime @default(now())
  
  subscriber   User     @relation(fields: [subscriberId], references: [id])
  channel      Channel  @relation(fields: [channelId], references: [id])

  @@unique([subscriberId, channelId])
}


model Upload {
  id               String           @id @default(uuid())
  channelId        String
  title            String
  description      String?
  hlsManifestUrl   String?
  thumbnailUrl     String?
  viewCount        Int              @default(0)
  isDeleted        Boolean          @default(false)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  visibility       Visibility       @default(PRIVATE)
  processingStatus ProcessingStatus @default(PENDING)

  channel          Channel          @relation(fields: [channelId], references: [id])
  assets           VideoAsset[]
  interactions     Interaction[]
  comments         Comment[]
  watchHistory     WatchHistory[]
}

model VideoAsset {
  id         String   @id @default(uuid())
  uploadId   String
  resolution String
  url        String
  createdAt  DateTime @default(now())

  upload     Upload   @relation(fields: [uploadId], references: [id])
}


model Interaction {
  id              String          @id @default(uuid())
  userId          String
  uploadId        String
  createdAt       DateTime        @default(now())

  user            User            @relation(fields: [userId], references: [id])
  upload          Upload          @relation(fields: [uploadId], references: [id])
  interactionType InteractionType

  @@unique([userId, uploadId])
}

model Comment {
  id        String   @id @default(uuid())
  content   String
  userId    String
  uploadId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id])
  upload    Upload   @relation(fields: [uploadId], references: [id])
}

model WatchHistory {
  id                String   @id @default(uuid())
  userId            String
  uploadId          String
  progressTimestamp Int      @default(0)
  watchedAt         DateTime @default(now())

  user              User     @relation(fields: [userId], references: [id])
  upload            Upload   @relation(fields: [uploadId], references: [id])

  @@unique([userId, uploadId])
}	
	
enum Visibility {
  PUBLIC
  PRIVATE
  UNLISTED
}

enum ProcessingStatus {
  PENDING
  UPLOADING
  TRANSCODING
  COMPLETED
  FAILED
}

enum InteractionType {
  LIKE
  DISLIKE
}

	

## The Upload & Transcoding Pipeline

Order of operations is critical here. If your worker fails, your database state must reflect it.

1. **Initialize Upload (Backend):**
The user clicks upload. The frontend sends the file metadata (title, description, file size) to your Node.js backend. The backend generates a Presigned URL using the AWS S3 SDK (configured for Cloudflare R2). It creates a new `uploads` record in your database with `processingStatus = 'PENDING'`.

2. **Direct Client Upload (Frontend):**
The frontend uses the Presigned URL to execute a `PUT` request directly to the R2 Ingest Bucket. The backend does not touch the video payload. Once complete, the frontend notifies the backend.

3. **Queue & Transcode (Worker Node):**
The backend pushes a job to a message queue (e.g., Redis/BullMQ). A separate Worker process picks it up, updates the database to `processingStatus = 'TRANSCODING'`, and downloads the raw MP4.

4. **HLS Generation (FFmpeg):**
The Worker runs an `ffmpeg` command to generate an Adaptive Bitrate Stream (HLS). It splits the video into 6-second `.ts` segments and creates a master `.m3u8` playlist containing variations for 1080p, 720p, and 480p.

5. **Delivery Storage & DB Update:**
The Worker uploads the newly generated HLS directory to your R2 Delivery Bucket. It updates the database setting `processingStatus = 'COMPLETED'` and saves the `masterPlaylistUrl` pointing to the CDN-cached `.m3u8` file.

---

## Handling Video Downloads
HLS streaming chops a video into hundreds of tiny `.ts` segments. A user cannot download an `.m3u8` playlist and play it locally like a standard video file.

To solve this, FFmpeg worker must perform dual-output encoding. Alongside generating the HLS segments for streaming, the worker must also output static `.mp4` files for each resolution (1080p, 720p). You store these MP4s in the bucket strictly for direct downloads.




-----
Authentication & Users
POST   /api/v1/auth/signup
POST   /api/v1/auth/signin
POST   /api/v1/auth/refresh
GET    /api/v1/users/me

Channels & Subscriptions
GET    /api/v1/channels/:handle
PUT    /api/v1/channels/me
POST   /api/v1/channels/:channelId/subscribe
DELETE /api/v1/channels/:channelId/subscribe

Upload & Transcoding Pipeline
POST   /api/v1/uploads/presigned-url
POST   /api/v1/uploads/remote-url
POST   /api/v1/uploads/:uploadId/finalize
GET    /api/v1/uploads/:uploadId/status

Video Playback & Discovery
GET    /api/v1/videos/:uploadId
GET    /api/v1/feed
GET    /api/v1/search

Interactions & Social
POST   /api/v1/videos/:uploadId/interactions
DELETE /api/v1/videos/:uploadId/interactions
GET    /api/v1/videos/:uploadId/comments
POST   /api/v1/videos/:uploadId/comments
DELETE /api/v1/comments/:commentId

Watch History
GET    /api/v1/history
PUT    /api/v1/history/:uploadId/progress