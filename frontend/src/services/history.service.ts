import { axiosClient } from "@/lib/axios";
import type { WatchHistoryItem, PaginatedResponse, ApiSuccessEnvelope } from "@/types/api";

export interface VideoProgressData {
  videoId: string;
  progressTimeStamp: number;
  watchedAt?: string | null;
}

export const historyService = {
  async getWatchHistory(params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<WatchHistoryItem>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<WatchHistoryItem>> | PaginatedResponse<WatchHistoryItem>>(
      "/history",
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<WatchHistoryItem>);
  },

  async getVideoProgress(videoId: string): Promise<VideoProgressData> {
    const res = await axiosClient.get<
      ApiSuccessEnvelope<VideoProgressData> | VideoProgressData
    >(`/history/${videoId}`);
    const resData = res.data;
    if ("success" in resData && resData.success && "data" in resData) {
      return resData.data;
    }
    return resData as VideoProgressData;
  },

  async recordProgress(
    videoId: string,
    positionSeconds: number,
  ): Promise<void> {
    await axiosClient.put(`/history/${videoId}/progress`, {
      progressTimeStamp: Math.max(0, Math.floor(positionSeconds)),
    });
  },

  async removeFromWatchHistory(videoId: string): Promise<{ success: boolean }> {
    const res = await axiosClient.delete<ApiSuccessEnvelope<{ success: boolean }> | { success: boolean }>(
      `/history/${videoId}`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { success: boolean });
  },

  async clearWatchHistory(): Promise<{ success: boolean }> {
    const res = await axiosClient.delete<ApiSuccessEnvelope<{ success: boolean }> | { success: boolean }>(
      "/history",
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { success: boolean });
  },
};
