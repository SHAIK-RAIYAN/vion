import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  AxiosError,
} from "axios";
import type { ApiErrorDetail, ApiErrorEnvelope } from "@/types/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? "/api/v1"
    : (process.env.BACKEND_URL || "http://localhost:5000") + "/api/v1");

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  data?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: unknown,
    data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.data = data;
  }
}

/**
 * Creates and configures the central Axios HTTP client for Vion.
 */
export function createAxiosClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // Request interceptor: attach bearer token if available in client storage
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("vion_token");
        if (token && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor: extract canonical success envelope or normalize error envelope
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      return response;
    },
    (error: AxiosError<ApiErrorEnvelope | Record<string, unknown>>) => {
      // Network failure or backend unreachable
      if (!error.response) {
        const isLocal =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        const defaultMsg = isLocal
          ? "Unable to connect to Vion backend. Ensure the server is running on port 5000."
          : "Unable to connect to Vion backend. The server may be waking up or experiencing high traffic. Please try again in a few moments.";
        return Promise.reject(
          new ApiError(
            error.message === "Network Error"
              ? defaultMsg
              : error.message || "Network request failed",
            0,
            "NETWORK_ERROR",
          ),
        );
      }

      const { status, data } = error.response;

      const errPayload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

      // Check canonical { success: false, error: { code, message, details } }
      if (errPayload.error && typeof errPayload.error === "object") {
        const errDetail = errPayload.error as Partial<ApiErrorDetail>;
        return Promise.reject(
          new ApiError(
            errDetail.message || "An unexpected API error occurred",
            status,
            errDetail.code || "API_ERROR",
            errDetail.details,
            data,
          ),
        );
      }

      // Check fallback { message: "..." } or array of messages
      let message = "Request failed";
      if (typeof errPayload.message === "string") {
        message = errPayload.message;
      } else if (
        Array.isArray(errPayload.message) &&
        errPayload.message[0] &&
        typeof errPayload.message[0] === "object" &&
        "message" in errPayload.message[0]
      ) {
        message = String((errPayload.message[0] as { message: unknown }).message);
      } else if (status === 404) {
        message = "Requested resource not found (404).";
      } else if (status === 401) {
        message = "Session expired or authentication required.";
      } else if (status === 403) {
        message = "You do not have permission to perform this action.";
      } else if (status === 502 || status === 503) {
        message = "Vion backend service temporarily unavailable.";
      }

      return Promise.reject(
        new ApiError(
          message,
          status,
          `HTTP_${status}`,
          undefined,
          data,
        ),
      );
    },
  );

  return instance;
}

export const axiosClient = createAxiosClient();
export default axiosClient;
