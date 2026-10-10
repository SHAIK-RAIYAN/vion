# Vion — Frontend (Next.js App Router)

The official web frontend for **Vion**, an original video-sharing platform. Built with **Next.js 16**, **React 19**, **Tailwind CSS v4**, and **Bun**.

---

## 🚀 Tech Stack

- **Framework**: Next.js 16 (App Router with React 19)
- **Styling**: Tailwind CSS v4 with OKLCH semantic tokens
- **Component Primitives**: shadcn/ui inspired components (`Button`, `Input`, `Badge`)
- **Theme & Appearance**: `next-themes` (Dark, Light, System) + `FontProvider` (persistent typefaces)
- **Notifications**: `sonner`
- **Command Palette**: `cmdk` (accessible via `Ctrl+K` / `Cmd+K`)
- **Icons**: `lucide-react`
- **Error Handling**: `ReusableErrorBoundary` component for fault isolation
- **Package Manager**: [Bun](https://bun.com)

---

## 🛠️ Quick Start

### 1. Prerequisites
- [Bun](https://bun.com) v1.3+
- Running Vion backend on `http://localhost:3000`

### 2. Environment Setup
```bash
cp .env.example .env.local
```

Configured in `.env.local`:
```env
NEXT_PUBLIC_API_URL="http://localhost:3000/api/v1"
```

### 3. Install & Run
```bash
# Install dependencies
bun install

# Start development server
bun dev
```

The frontend runs at: **http://localhost:5173** (or http://localhost:3001 if port 3000 is occupied by backend).

### 4. Production Build
```bash
bun run build
```

---

## 🌐 Connected Backend Endpoints

| Area | Endpoint | Status | Description |
|---|---|---|---|
| **Feed** | `GET /api/v1/upload` | Connected ✅ | Real paginated video feed with view counts & thumbnails |
| **Video** | `GET /api/v1/upload/:id` | Connected ✅ | Video details, channel information, and visibility rules |
| **Auth** | `POST /api/v1/auth/signin` | Connected ✅ | Cookie & Bearer token login |
| **Auth** | `POST /api/v1/auth/signup` | Connected ✅ | User registration |
| **Auth** | `POST /api/v1/auth/signout` | Connected ✅ | Client and cookie session clearance |
| **User** | `GET /api/v1/user` | Connected ✅ | Authenticated user profile retrieval |
| **Subscriptions** | `GET /api/v1/subscription/my` | Connected ✅ | Subscribed channels feed |
| **Subscriptions** | `POST /api/v1/subscription/:id/toggle` | Connected ✅ | Atomic subscribe / unsubscribe action |
| **Subscriptions** | `GET /api/v1/subscription/:id/status` | Connected ✅ | Real-time subscription state |

---

## 🧭 Implemented Routes

- **`/`**: Home Feed displaying real videos from the backend, search bar with live filtering, responsive Sidebar navigation rail, and loading skeletons.
- **`/subscriptions`**: User subscribed channels with quick-toggle unsubscribe buttons and unauthenticated prompt.
- **`/settings`**: Appearance preferences (Light / Dark / System modes), interface font selector (System, Inter, Outfit, Plus Jakarta Sans) stored in `localStorage`, and authenticated account information with logout action.
- **`/watch/[id]`**: Video stream container slice displaying titles, channel details, subscribe toggle, and description.

---

## 🛡️ Fault Isolation & Error Boundaries

Each major route and widget is wrapped with `ReusableErrorBoundary`:
- Stream failure does not unmount video details or page navigation.
- If backend is offline or network fails, a retryable connection state is displayed rather than an unhandled blank screen.
