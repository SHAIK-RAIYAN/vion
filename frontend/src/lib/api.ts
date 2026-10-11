import type {
  User,
  Upload,
  PaginatedResponse,
  SubscriptionItem,
  Channel,
} from "../types/api";
import { axiosClient, ApiError, API_BASE_URL } from "./axios";

export { axiosClient, ApiError, API_BASE_URL };
export * from "@/services";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const url = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  let parsedBody: any = undefined;
  if (options.body) {
    try {
      parsedBody =
        typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    } catch {
      parsedBody = options.body;
    }
  }

  const res = await axiosClient.request<T>({
    url,
    method,
    data: parsedBody,
    headers: options.headers as Record<string, string>,
  });

  return res.data;
}

export const api = {
  // 1. AUTH (/api/v1/auth)
  auth: {
    signup: async (body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      gender: "MALE" | "FEMALE" | "OTHER";
      dob?: string;
    }) => {
      return request<{ message: string; data: User }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    signin: async (body: { email: string; password: string }) => {
      const res = await request<{ message: string; token?: string; data?: { token: string } }>(
        "/auth/signin",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      const token = res.token || res.data?.token;
      if (token && typeof window !== "undefined") {
        localStorage.setItem("vion_token", token);
      }
      return res;
    },

    google: async (idToken: string) => {
      const res = await request<{ message: string; token?: string; data?: User; user?: User }>(
        "/auth/google",
        {
          method: "POST",
          body: JSON.stringify({ idToken }),
        },
      );
      const token = res.token;
      if (token && typeof window !== "undefined") {
        localStorage.setItem("vion_token", token);
      }
      return res;
    },


    signout: async () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("vion_token");
      }
      return request<{ message: string }>("/auth/signout", {
        method: "POST",
      });
    },

    getMe: async () => {
      return request<{ message: string; data: User }>("/auth/me", {
        method: "GET",
      });
    },

    forgotPassword: async (email: string) => {
      return request<{ message: string; data: any }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    resetPassword: async (token: string, newPassword: string) => {
      return request<{ message: string; data: any }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
    },
  },

  // 2. USERS (/api/v1/users)
  users: {
    getMe: async () => {
      return request<{ message: string; data: User }>("/users/me", {
        method: "GET",
      });
    },

    updateMe: async (body: Partial<User>) => {
      return request<{ message: string; data: User }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    deleteMe: async () => {
      return request<{ message: string; data: any }>("/users/me", {
        method: "DELETE",
      });
    },

    changePassword: async (currentPassword: string, newPassword: string) => {
      return request<{ message: string; data: any }>("/users/me/changePassword", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },

    getSubscriptions: async (page = 1, limit = 20) => {
      return request<PaginatedResponse<SubscriptionItem>>(
        `/users/me/subscriptions?page=${page}&limit=${limit}`,
        { method: "GET" },
      );
    },
  },

  // 3. CHANNELS (/api/v1/channels)
  channels: {
    create: async (body: { handle: string; channelName: string; description?: string }) => {
      return request<{ message: string; data: Channel }>("/channels", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    getById: async (channelId: string) => {
      return request<{ message: string; data: Channel }>(`/channels/${channelId}`, {
        method: "GET",
      });
    },

    getByHandle: async (handle: string) => {
      return request<{ message: string; data: Channel }>(
        `/channels/handle/${handle}`,
        { method: "GET" },
      );
    },

    getMyChannel: async () => {
      return request<{ message: string; data: Channel }>("/channels/me", {
        method: "GET",
      });
    },

    update: async (body: Partial<Channel>) => {
      return request<{ message: string; data: Channel }>("/channels/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete: async () => {
      return request<{ message: string; data: any }>("/channels/me", {
        method: "DELETE",
      });
    },
  },

  // 4. SUBSCRIPTIONS (Canonical routes under /channels/:channelId/subscription and /users/me/subscriptions)
  subscriptions: {
    getMy: async (page = 1, limit = 20) => {
      return request<PaginatedResponse<SubscriptionItem>>(
        `/users/me/subscriptions?page=${page}&limit=${limit}`,
        { method: "GET" },
      );
    },

    getStatus: async (channelId: string) => {
      return request<{ message: string; data: { isSubscribed: boolean } }>(
        `/channels/${channelId}/subscription`,
        { method: "GET" },
      );
    },

    subscribe: async (channelId: string) => {
      return request<{ message: string; data: any }>(
        `/channels/${channelId}/subscription`,
        { method: "POST" },
      );
    },

    unsubscribe: async (channelId: string) => {
      return request<{ message: string; data: any }>(
        `/channels/${channelId}/subscription`,
        { method: "DELETE" },
      );
    },

    toggle: async (channelId: string) => {
      try {
        const statusRes = await api.subscriptions.getStatus(channelId);
        const isSubscribed = Boolean(statusRes?.data?.isSubscribed);
        if (isSubscribed) {
          await api.subscriptions.unsubscribe(channelId);
          return { message: "Unsubscribed successfully", data: { isSubscribed: false } };
        } else {
          await api.subscriptions.subscribe(channelId);
          return { message: "Subscribed successfully", data: { isSubscribed: true } };
        }
      } catch {
        // Fallback directly to subscribe POST
        await api.subscriptions.subscribe(channelId);
        return { message: "Subscribed successfully", data: { isSubscribed: true } };
      }
    },
  },

  // 5. UPLOADS (/api/v1/uploads) - Ingest and processing lifecycle
  uploads: {
    create: async (body: {
      title: string;
      description?: string;
      visibility?: string;
      fileName?: string;
      contentType?: string;
      thumbnailUrl?: string;
    }) => {
      return request<{
        message: string;
        data: {
          uploadId: string;
          title: string;
          visibility: any;
          processingStatus: string;
          uploadSession: any;
        };
      }>("/uploads", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    getPresignedUrl: async (body: {
      fileName: string;
      contentType: string;
      fileSize?: number;
      uploadId?: string;
    }) => {
      return request<{ message: string; data: any }>("/uploads/presigned-url", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    createRemoteUrl: async (body: { url: string; title: string; description?: string }) => {
      return request<{ message: string; data: any }>("/uploads/remote-url", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    getById: async (uploadId: string) => {
      // For public video playback, delegates to canonical /videos/:id
      return api.videos.getById(uploadId);
    },

    getStatus: async (uploadId: string) => {
      return request<{ message: string; data: any }>(`/uploads/${uploadId}/status`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });
    },

    finalize: async (uploadId: string, body?: { storageKey?: string }) => {
      return request<{ message: string; data: any }>(`/uploads/${uploadId}/finalize`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
    },

    delete: async (uploadId: string) => {
      return request<{ message: string; data: any }>(`/uploads/${uploadId}`, {
        method: "DELETE",
      });
    },

    // Feed compatibility alias redirecting to canonical /feed
    getPublicFeed: async (page = 1, limit = 24) => {
      return api.feed.get(page, limit);
    },
  },

  // 6. VIDEOS / PUBLICATION (/api/v1/videos) - Platform content & Playback
  videos: {
    getById: async (videoId: string) => {
      return request<{ message: string; data: Upload }>(`/videos/${videoId}`, {
        method: "GET",
      });
    },

    publish: async (body: { uploadId: string; title?: string; description?: string; visibility?: string }) => {
      return request<{ message: string; data: Upload }>("/videos", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update: async (videoId: string, body: Partial<Upload>) => {
      return request<{ message: string; data: Upload }>(`/videos/${videoId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}`, {
        method: "DELETE",
      });
    },

    getPlayback: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}/playback`, {
        method: "GET",
      });
    },

    like: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}/like`, {
        method: "PUT",
      });
    },

    unlike: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}/like`, {
        method: "DELETE",
      });
    },

    getLikeStatus: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}/like`, {
        method: "GET",
      });
    },

    getComments: async (videoId: string, page = 1, limit = 20) => {
      return request<PaginatedResponse<any>>(`/videos/${videoId}/comments?page=${page}&limit=${limit}`, {
        method: "GET",
      });
    },

    createComment: async (videoId: string, content: string) => {
      return request<{ message: string; data: any }>(`/videos/${videoId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },

    deleteComment: async (commentId: string) => {
      return request<{ message: string; data: any }>(`/comments/${commentId}`, {
        method: "DELETE",
      });
    },
  },

  // 7. FEED (/api/v1/feed)
  feed: {
    get: async (page = 1, limit = 24) => {
      return request<PaginatedResponse<Upload>>(
        `/feed?page=${page}&limit=${limit}`,
        { method: "GET" },
      );
    },
  },

  // 8. SEARCH (/api/v1/search)
  search: {
    query: async (query: string, page = 1, limit = 20) => {
      return request<PaginatedResponse<Upload>>(
        `/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
        { method: "GET" },
      );
    },

    suggestions: async (query: string) => {
      return request<{ success: boolean; data: string[] }>(
        `/search/suggestions?q=${encodeURIComponent(query)}`,
        { method: "GET" },
      );
    },
  },

  // 9. WATCH HISTORY (/api/v1/history)
  history: {
    get: async (page = 1, limit = 20) => {
      return request<PaginatedResponse<any>>(`/history?page=${page}&limit=${limit}`, {
        method: "GET",
      });
    },

    getProgress: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/history/${videoId}`, {
        method: "GET",
      });
    },

    recordProgress: async (videoId: string, progressTimeStamp: number) => {
      return request<{ message: string; data: any }>(`/history/${videoId}/progress`, {
        method: "PUT",
        body: JSON.stringify({ progressTimeStamp }),
      });
    },

    remove: async (videoId: string) => {
      return request<{ message: string; data: any }>(`/history/${videoId}`, {
        method: "DELETE",
      });
    },

    clear: async () => {
      return request<{ message: string; data: any }>("/history", {
        method: "DELETE",
      });
    },
  },
};
