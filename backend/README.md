# Vion YouTube — Backend API

Modern, production-grade backend for the Vion YouTube platform built with **Bun**, **Express 5**, and **Prisma ORM 8 RC** (contract-based data layer) on **PostgreSQL**.

---

## 🚀 Tech Stack

- **Runtime**: [Bun](https://bun.com) v1.3+
- **Web Framework**: [Express 5](https://expressjs.com/)
- **Database & ORM**: PostgreSQL with [Prisma ORM 8 RC](https://www.prisma.io/) (`@prisma/orm-postgres`)
- **Validation**: [Zod 4](https://zod.dev/)
- **Authentication**: JWT (HTTP-only cookies & Bearer tokens) with `bcrypt` password hashing
- **Containerization**: Docker Compose (PostgreSQL 16)

---

## 📁 Project Architecture

```
backend/
├── src/
│   ├── config/              # Env config and defaults
│   ├── middlewares/         # authMiddleware, optionalAuthMiddleware, errorHandler
│   ├── modules/
│   │   ├── auth/            # Sign up, sign in, sign out
│   │   ├── user/            # Profile CRUD, password change
│   │   ├── channel/         # Channel profiles, handles, banner/avatar
│   │   ├── subscription/    # Channel subscriptions & subscribers list
│   │   ├── upload/          # Video metadata, visibility, streaming resolutions
│   │   ├── interaction/     # Likes and dislikes toggling & aggregation
│   │   ├── comment/         # Comments with user relations and moderation
│   │   └── watchHistory/    # Playback timestamp progress tracking & history
│   ├── prisma/
│   │   ├── contract.prisma  # Schema contract (Final & immutable)
│   │   ├── contract.json    # Emitted contract specification
│   │   ├── contract.d.ts    # Generated TypeScript contract definitions
│   │   └── db.ts            # Prisma 8 Postgres connection singleton
│   ├── routes/              # Centralized route orchestration
│   ├── types/               # Express request and ambient typings
│   ├── utils/               # AppError, asyncHandler, pagination utilities
│   └── index.ts             # Application entrypoint
├── docker-compose.yml       # Local PostgreSQL database container
├── package.json
└── tsconfig.json
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- [Bun](https://bun.com) (`curl -fsSL https://bun.sh/install | bash` or `powershell -c "irm bun.sh/install.ps1|iex"`)
- [Docker & Docker Compose](https://www.docker.com/)

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

Review `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vion_youtube?schema=public"
SALT_ROUNDS=10
JWT_SECRET_KEY="your_secure_random_key_here"
FRONTEND_URL="http://localhost:5173"
NODE_ENV="development"
```

### 3. Start PostgreSQL with Docker
```bash
docker-compose up -d
```

### 4. Install Dependencies & Emit Prisma 8 Contract
```bash
bun install
bun run contract:emit
```

### 5. Run the Server
Development (watch mode):
```bash
bun run dev
```

Production mode:
```bash
bun start
```

---

## 📑 API Reference (`/api/v1`)

### 🔐 Authentication (`/api/v1/auth`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | Register user account | Public |
| `POST` | `/api/v1/auth/signin` | Sign in & set JWT cookie | Public |
| `POST` | `/api/v1/auth/signout` | Clear auth cookie | Public |

### 👤 User (`/api/v1/user`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/user/` | Get current user profile | Required |
| `PUT` | `/api/v1/user/` | Update profile information | Required |
| `DELETE` | `/api/v1/user/` | Delete current user account | Required |
| `POST` | `/api/v1/user/change-password` | Change user password | Required |

### 📺 Channel (`/api/v1/channel`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/channel/` | Create a new channel | Required |
| `GET` | `/api/v1/channel/me` | Get user's own channel details | Required |
| `PATCH` | `/api/v1/channel/` | Update channel profile/banner/handle | Required |
| `GET` | `/api/v1/channel/handle/:handle` | Get channel profile by unique handle | Public |
| `GET` | `/api/v1/channel/:id` | Get channel profile by ID | Public |

### 🔔 Subscription (`/api/v1/subscription`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/subscription/my` | Paginated channels user is subscribed to | Required |
| `GET` | `/api/v1/subscription/:channelId/status` | Check subscription status (`isSubscribed`) | Required |
| `POST` | `/api/v1/subscription/:channelId/toggle` | Toggle subscribe / unsubscribe | Required |
| `POST` | `/api/v1/subscription/:channelId` | Subscribe to a channel | Required |
| `DELETE` | `/api/v1/subscription/:channelId` | Unsubscribe from a channel | Required |
| `GET` | `/api/v1/subscription/channel/:channelId` | List channel subscribers | Public |

### 🎬 Video Uploads (`/api/v1/upload`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/upload/` | Public videos feed (paginated) | Public |
| `GET` | `/api/v1/upload/my` | Authenticated user's channel videos | Required |
| `GET` | `/api/v1/upload/channel/:channelId` | Videos belonging to a specific channel | Optional |
| `GET` | `/api/v1/upload/:id` | Video details (enforces PUBLIC/PRIVATE rules) | Optional |
| `POST` | `/api/v1/upload/` | Create video upload metadata | Required |
| `PATCH` | `/api/v1/upload/:id` | Update metadata/visibility/status | Required |
| `DELETE` | `/api/v1/upload/:id` | Soft-delete video (`isDeleted = true`) | Required |
| `POST` | `/api/v1/upload/:id/videos` | Attach resolution rendition (e.g. 1080p, 720p) | Required |

### 👍 Interactions (`/api/v1/interaction`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/interaction/my/likes` | Paginated list of videos user liked | Required |
| `GET` | `/api/v1/interaction/:uploadId` | Like & dislike counts + user state | Optional |
| `POST` | `/api/v1/interaction/:uploadId` | Set/toggle interaction (`type: "LIKE" \| "DISLIKE"`) | Required |
| `DELETE` | `/api/v1/interaction/:uploadId` | Remove like or dislike interaction | Required |

### 💬 Comments (`/api/v1/comment`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/comment/upload/:uploadId` | Paginated comments with author details | Public |
| `POST` | `/api/v1/comment/upload/:uploadId` | Add comment to a video | Required |
| `PATCH` | `/api/v1/comment/:commentId` | Edit comment (author only) | Required |
| `DELETE` | `/api/v1/comment/:commentId` | Delete comment (author or video channel owner) | Required |

### ⏱️ Watch History (`/api/v1/history`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/history/` | Record/update playback timestamp in seconds | Required |
| `GET` | `/api/v1/history/` | Paginated watch history | Required |
| `DELETE` | `/api/v1/history/clear` | Clear all user watch history | Required |
| `DELETE` | `/api/v1/history/:uploadId` | Remove a single video from watch history | Required |

---

## ⚙️ Video Engineering Note
The metadata foundation, database relations, and API contracts for video pipelines are fully implemented.
Background video processing pipelines (FFmpeg transcoding, HLS chunking/manifest packaging, thumbnail extraction, and worker queues) attach seamlessly into:
1. `Upload.hlsManifestUrl`
2. `Upload.thumbnailUrl`
3. `Upload.processingStatus` (`PENDING`, `UPLOADING`, `TRANSCODING`, `COMPLETED`, `FAILED`)
4. `Video` table renditions (`POST /api/v1/upload/:id/videos`)
