# Chapter 10: Frontend Architecture & Integration Overview

This document provides a concise architectural overview of the Vion web client built with **Next.js 16 App Router**, **React 19**, **Tailwind CSS v4**, **shadcn/ui**, and **GSAP**.

---

## 1. Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16.4 (App Router)** | Server Components, client routing, Turbopack bundling. |
| **Language** | **TypeScript 5** | End-to-end type safety with backend API contracts. |
| **Styling** | **Tailwind CSS v4** | Modern, token-based utility styling (`@theme` variables). |
| **UI Components** | **shadcn/ui + Radix UI** | Accessible dialogs, dropdowns, avatars, tooltips, buttons. |
| **Animation Engine** | **GSAP (GreenSock)** | Smooth micro-interactions and tab indicator transitions. |
| **Smooth Scrolling** | **Lenis** | Momentum-based, buttery smooth viewport scrolling. |
| **HTTP Transport** | **Axios (`withCredentials: true`)** | Cookie-based session persistence, interceptors, error envelopes. |
| **Streaming Player** | **Hls.js + HTML5 `<video>`** | Adaptive bitrate HLS stream decoding. |

---

## 2. Directory Structure

Located in the [`frontend/`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/frontend) folder:

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── channel/[id]/       # Creator channel page
│   │   ├── history/            # Watch history feed
│   │   ├── search/             # Search results view
│   │   ├── settings/           # User account settings
│   │   ├── subscriptions/      # Subscriptions feed
│   │   ├── watch/[id]/         # Video playback & comments page
│   │   ├── layout.tsx          # Root shell layout (Nav, Sidebar, ThemeProvider)
│   │   └── page.tsx            # Home video feed
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # shadcn/ui primitives (Button, Dialog, Input, etc.)
│   │   ├── player/             # HlsVideoPlayer.tsx
│   │   ├── upload/             # UploadDialog.tsx
│   │   ├── video/              # VideoCard.tsx, VideoGrid.tsx
│   │   └── layout/             # Navbar.tsx, Sidebar.tsx
│   ├── hooks/                  # Custom React hooks (useAuth, useVideo)
│   ├── lib/
│   │   ├── api.ts              # Typed backend API client
│   │   ├── axios.ts            # Axios instance with credentials & interceptors
│   │   └── utils.ts            # cn() class merging utility
│   └── types/                  # TypeScript interface definitions
```

---

## 3. API Communication Layer (`src/lib/api.ts`)

All communication between the Next.js frontend and Express backend flows through [`src/lib/api.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/frontend/src/lib/api.ts).

### 3.1. Axios Instance Configuration
In [`src/lib/axios.ts`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/frontend/src/lib/axios.ts):
```typescript
export const axiosClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true, // Automatically sends and receives HTTP-only auth cookies
  headers: {
    "Content-Type": "application/json",
  },
});
```

### 3.2. Strongly Typed API Namespaces
The `api` export organizes endpoints into clear namespaces:
- `api.auth.signin({ email, password })`
- `api.uploads.create(data)`
- `api.uploads.finalize(uploadId, storageKey)`
- `api.videos.getById(id)`
- `api.comments.list(videoId, page)`
- `api.history.updateProgress(videoId, timestamp)`

---

## 4. Key Interactive Components

### 4.1. The Adaptive Streaming Player (`HlsVideoPlayer.tsx`)
Located at [`frontend/src/components/player/HlsVideoPlayer.tsx`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/frontend/src/components/player/HlsVideoPlayer.tsx):

- **Hls.js Integration**: When `hlsManifestUrl` is loaded, it checks `Hls.isSupported()`.
- **Safari Fallback**: If running on iOS or Safari macOS (which support native Apple HLS without MSE), it attaches the manifest directly to `video.src`.
- **Adaptive Bitrate Controls**: Extracts available quality levels from the HLS manifest (1080p, 720p, 480p, 360p, Auto) and exposes a custom settings menu.
- **Keyboard Navigation**:
  - `Space` / `K`: Play / Pause.
  - `Left` / `Right`: Seek 5 seconds backward / forward.
  - `M`: Toggle Mute.
  - `F`: Toggle Fullscreen.

---

### 4.2. Direct-to-Storage Upload Modal (`UploadDialog.tsx`)
Located at [`frontend/src/components/upload/UploadDialog.tsx`](file:///f:/VS%20CODE/Codes/Projects/Vion%20youtube/frontend/src/components/upload/UploadDialog.tsx):

```
1. Drag & Drop File ──► 2. POST /uploads (Get signed URL)
                     ──► 3. Direct HTTP PUT to Supabase (Tracks 0-100% upload progress)
                     ──► 4. POST /uploads/:id/finalize (Enqueues transcode job)
                     ──► 5. Polls /uploads/:id/status until status is COMPLETED
```

This dialog manages the multi-stage upload sequence directly inside the browser, displaying live progress bars for both upload transfer and worker transcoding.

---

### 4.3. Micro-Animations with GSAP
Unlike heavy animation libraries, Vion uses **GSAP** (`gsap`) for focused, 60fps micro-interactions:
- **Active Navigation Pill**: Animates the active indicator bar smoothly between sidebar routes.
- **Video Card Hover Effects**: Smoothly lifts thumbnails and previews duration badges on mouse hover.
- **Dialog Transitions**: Staggered fade-and-scale animations when opening modals.

---

## 5. What to Remember

1. **`withCredentials: true` is Required**: Ensures the browser sends HTTP-only session cookies with every cross-origin API call.
2. **Direct Storage Uploads**: The frontend uploads video files straight to Supabase Storage via signed PUT URLs, bypassing the Express backend.
3. **Adaptive Player Logic**: Uses `Hls.js` for Chromium/Firefox and native `video.src` for Safari/iOS.
4. **GSAP for Motion**: High-performance transforms without React re-render churn.
