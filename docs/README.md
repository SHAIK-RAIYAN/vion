# Vion — Complete Documentation & Technical Handbook

Welcome to the **Vion Technical Handbook**. This documentation is written for software engineers who understand basic JavaScript/TypeScript and CRUD development, but want to understand **production video engineering, distributed job queues, object storage, and adaptive streaming**.

Vion is an original video-sharing platform inspired by YouTube, engineered with **Next.js 16 App Router**, **Express 5 on Bun**, **Neon Managed PostgreSQL (Prisma ORM 8 RC)**, **Supabase Object Storage**, **Redis 7 & BullMQ**, and **FFprobe / FFmpeg 8**.

---

## 🗺️ Handbook Navigation

| Chapter | Document | Core Subject & Focus |
|---|---|---|
| **01** | [Project Overview](./PROJECT_OVERVIEW.md) | High-level system architecture, technology rationale, directory layout, and the 4 implementation states. |
| **02** | [Backend Architecture](./BACKEND_ARCHITECTURE.md) | Express on Bun, request lifecycle, middleware, controllers, services, Zod schemas, error handling, and request walkthroughs. |
| **03** | [Database & Prisma](./DATABASE_AND_PRISMA.md) | Neon PostgreSQL, Prisma ORM 8 RC (`prisma-next`), ERD relationships, the "Upload vs Video" reality, and schema contracts. |
| **04** | [Video Upload & Processing](./VIDEO_UPLOAD_AND_PROCESSING.md) | The complete video lifecycle from browser drag-and-drop to Supabase signed upload, BullMQ queueing, and playback availability. |
| **05** | [Video Formats, Transcoding & Playback](./VIDEO_FORMATS_THUMBNAILS_AND_PLAYBACK.md) | Video fundamentals (codecs, containers, bitrates), FFprobe inspection, FFmpeg transcoding, HLS adaptive streaming, thumbnails, and delivery. |
| **06** | [Storage, Queue & Workers](./STORAGE_QUEUE_AND_WORKERS.md) | Supabase 3-bucket isolation, direct-to-storage transfers, Redis & BullMQ job worker lifecycle, retries, idempotency, and concurrency. |
| **07** | [Canonical API Reference](./API_REFERENCE.md) | Complete endpoint specifications based on `vion_plan.md` and Express route registrations, payloads, envelopes, and status codes. |
| **08** | [Security, Failures & Debugging](./SECURITY_FAILURES_AND_DEBUGGING.md) | Security gates (SSRF, auth cookies, signed URLs, FFmpeg argument arrays), failure modes, and systematic troubleshooting table. |
| **09** | [Local Development & Setup Guide](./LOCAL_DEVELOPMENT.md) | Step-by-step setup with Bun, Docker containers, database migrations, worker execution, and debugging checklists. |
| **10** | [Frontend Overview](./FRONTEND_OVERVIEW.md) | Next.js 16 App Router, Tailwind v4, shadcn/ui, GSAP animations, Lenis smooth scrolling, `hls.js` player, and API client layers. |

---

## 🏷️ The Four Implementation States

Throughout every document in this handbook, technical capabilities and endpoints are explicitly marked with one of four engineering states:

1. **`[IMPLEMENTED]`**: Fully supported in the active codebase, connected end-to-end, and verified with tests or live compiler checks.
2. **`[PARTIALLY IMPLEMENTED]`**: Code exists in services or controllers, but specific peripheral features (e.g. storage signed URLs or UI hooks) require active credentials or secondary steps.
3. **`[PLANNED]`**: Defined in [`vion_plan.md`](../vion_plan.md) as part of the intended product roadmap, but deliberately not yet implemented in the schema or controllers.
4. **`[BLOCKED / UNVERIFIED]`**: Requires external third-party services or infrastructure (such as live Supabase credentials, Redis server instance, or production SSL certs) to function live.

---

## 💡 How to Read This Handbook

- If you want a **quick system understanding**, read [Chapter 1: Project Overview](./PROJECT_OVERVIEW.md) first.
- If you are learning **video engineering for the first time**, read [Chapter 4: Video Upload & Processing](./VIDEO_UPLOAD_AND_PROCESSING.md) followed by [Chapter 5: Video Formats, Transcoding & Playback](./VIDEO_FORMATS_THUMBNAILS_AND_PLAYBACK.md).
- If you need to **run or debug the platform**, go straight to [Chapter 9: Local Development](./LOCAL_DEVELOPMENT.md) and [Chapter 8: Security, Failures & Debugging](./SECURITY_FAILURES_AND_DEBUGGING.md).
