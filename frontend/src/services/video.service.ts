import { axiosClient } from "@/lib/axios";
import type {
  Upload,
  Comment,
  Interaction,
  PaginatedResponse,
  ApiSuccessEnvelope,
  PlaybackInfo,
  LikeStatus,
  VideoDownloadInfo,
} from "@/types/api";

export const videoService = {
  async getVideos(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Upload>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<Upload>> | PaginatedResponse<Upload>>(
      "/feed",
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<Upload>);
  },

  async getVideoById(id: string): Promise<Upload> {
    const res = await axiosClient.get<ApiSuccessEnvelope<Upload> | Upload>(`/videos/${id}`);
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Upload);
  },

  async getPlayback(id: string): Promise<PlaybackInfo> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PlaybackInfo> | PlaybackInfo>(
      `/videos/${id}/playback`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PlaybackInfo);
  },

  async getDownload(id: string, quality?: string): Promise<VideoDownloadInfo> {
    const res = await axiosClient.get<ApiSuccessEnvelope<VideoDownloadInfo> | VideoDownloadInfo>(
      `/videos/${id}/download`,
      { params: quality ? { quality } : undefined },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as VideoDownloadInfo);
  },

  async getReaction(id: string): Promise<LikeStatus> {
    const res = await axiosClient.get<ApiSuccessEnvelope<LikeStatus> | LikeStatus>(
      `/videos/${id}/like`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as LikeStatus);
  },

  async likeVideo(id: string): Promise<Interaction> {
    const res = await axiosClient.put<ApiSuccessEnvelope<Interaction> | Interaction>(
      `/videos/${id}/like`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Interaction);
  },

  async unlikeVideo(id: string): Promise<{ success: boolean }> {
    const res = await axiosClient.delete<ApiSuccessEnvelope<{ success: boolean }> | { success: boolean }>(
      `/videos/${id}/like`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { success: boolean });
  },

  async publishVideo(uploadId: string): Promise<Upload> {
    const res = await axiosClient.post<ApiSuccessEnvelope<Upload> | Upload>(
      "/videos",
      { uploadId },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Upload);
  },

  async getComments(
    id: string,
    params?: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<Comment>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<Comment>> | PaginatedResponse<Comment>>(
      `/videos/${id}/comments`,
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<Comment>);
  },

  async addComment(id: string, content: string): Promise<Comment> {
    const res = await axiosClient.post<ApiSuccessEnvelope<Comment> | Comment>(
      `/videos/${id}/comments`,
      { content },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Comment);
  },

  async deleteComment(commentId: string): Promise<{ success: boolean }> {
    const res = await axiosClient.delete<ApiSuccessEnvelope<{ success: boolean }> | { success: boolean }>(
      `/comments/${commentId}`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { success: boolean });
  },
};
