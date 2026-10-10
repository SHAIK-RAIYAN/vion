import type {
  User,
  Upload,
  PaginatedResponse,
  SubscriptionItem,
  Channel,
} from "../types/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? "/api/v1"
    : (process.env.BACKEND_URL || "http://localhost:5000") + "/api/v1");

export class ApiError extends Error {
  statusCode: number;
  data: any;

  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const token = typeof window !== "undefined" ? localStorage.getItem("vion_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // send/receive cookies
    });
  } catch (err: any) {
    throw new ApiError(
      "Unable to connect to Vion backend. Ensure the server is running.",
      0,
    );
  }

  let responseData: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    let errorMessage =
      responseData?.message ||
      (Array.isArray(responseData?.message)
        ? responseData.message[0]?.message
        : null);

    if (!errorMessage) {
      if (response.status === 404) {
        errorMessage =
          "Backend endpoint returned 404. Ensure backend is running (`bun run dev` in backend/).";
      } else if (response.status === 502 || response.status === 503) {
        errorMessage =
          "Cannot reach Vion backend on port 5000. Please start the backend (`bun run dev` in backend/).";
      } else {
        errorMessage = response.statusText || "Request failed";
      }
    }

    throw new ApiError(
      typeof errorMessage === "string" ? errorMessage : "An error occurred",
      response.status,
      responseData,
    );
  }

  return responseData as T;
}

export const api = {
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
      const res = await request<{ message: string; token?: string }>(
        "/auth/signin",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (res.token && typeof window !== "undefined") {
        localStorage.setItem("vion_token", res.token);
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
      return request<{ message: string; data: User }>("/user", {
        method: "GET",
      });
    },
  },

  uploads: {
    getPublicFeed: async (page = 1, limit = 24) => {
      return request<PaginatedResponse<Upload>>(
        `/upload?page=${page}&limit=${limit}`,
        {
          method: "GET",
        },
      );
    },

    getById: async (id: string) => {
      return request<{ message: string; data: Upload }>(`/upload/${id}`, {
        method: "GET",
      });
    },
  },

  channels: {
    getById: async (id: string) => {
      return request<{ message: string; data: Channel }>(`/channel/${id}`, {
        method: "GET",
      });
    },

    getByHandle: async (handle: string) => {
      return request<{ message: string; data: Channel }>(
        `/channel/handle/${handle}`,
        {
          method: "GET",
        },
      );
    },

    getMyChannel: async () => {
      return request<{ message: string; data: Channel }>("/channel/me", {
        method: "GET",
      });
    },
  },

  subscriptions: {
    getMy: async (page = 1, limit = 20) => {
      return request<PaginatedResponse<SubscriptionItem>>(
        `/subscription/my?page=${page}&limit=${limit}`,
        {
          method: "GET",
        },
      );
    },

    getStatus: async (channelId: string) => {
      return request<{ message: string; data: { isSubscribed: boolean } }>(
        `/subscription/${channelId}/status`,
        {
          method: "GET",
        },
      );
    },

    toggle: async (channelId: string) => {
      return request<{ message: string; data: { isSubscribed: boolean } }>(
        `/subscription/${channelId}/toggle`,
        {
          method: "POST",
        },
      );
    },
  },
};
