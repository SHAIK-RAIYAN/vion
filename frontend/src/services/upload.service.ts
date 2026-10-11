import { axiosClient } from "@/lib/axios";
import type {
  Upload,
  UploadVisibility,
  PaginatedResponse,
  ApiSuccessEnvelope,
} from "@/types/api";

export interface CreateUploadDto {
  title: string;
  description?: string;
  visibility?: UploadVisibility;
  fileName?: string;
  contentType?: string;
  thumbnailUrl?: string;
}

export interface UploadSessionData {
  uploadUrl: string;
  key: string;
  bucket: string;
  token: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxSizeBytes: number;
}

export interface CreateUploadResponse {
  uploadId: string;
  title: string;
  visibility: UploadVisibility;
  processingStatus: string;
  uploadSession: UploadSessionData;
}

export interface FinalizeUploadResponse {
  uploadId: string;
  status: string;
  message: string;
  alreadyProcessing?: boolean;
  alreadyCompleted?: boolean;
}

export interface UploadStatusResponse {
  uploadId: string;
  status: string;
  visibility: UploadVisibility;
  hasManifest: boolean;
  hlsManifestUrl?: string | null;
  videoCount: number;
}

export const uploadService = {
  /**
   * Create an upload session in the database and receive direct storage credentials
   */
  async create(dto: CreateUploadDto): Promise<CreateUploadResponse> {
    const res = await axiosClient.post<ApiSuccessEnvelope<CreateUploadResponse> | CreateUploadResponse>(
      "/uploads",
      dto,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as CreateUploadResponse);
  },

  /**
   * Finalize an upload after direct PUT has succeeded
   */
  async finalize(uploadId: string, storageKey?: string): Promise<FinalizeUploadResponse> {
    const res = await axiosClient.post<ApiSuccessEnvelope<FinalizeUploadResponse> | FinalizeUploadResponse>(
      `/uploads/${uploadId}/finalize`,
      storageKey ? { storageKey } : {},
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as FinalizeUploadResponse);
  },

  /**
   * Check background transcoding status
   */
  async getStatus(uploadId: string): Promise<UploadStatusResponse> {
    const res = await axiosClient.get<ApiSuccessEnvelope<UploadStatusResponse> | UploadStatusResponse>(
      `/uploads/${uploadId}/status`,
      {
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as UploadStatusResponse);
  },

  /**
   * Get full upload metadata
   */
  async getUploadById(uploadId: string): Promise<Upload> {
    const res = await axiosClient.get<ApiSuccessEnvelope<Upload> | Upload>(`/uploads/${uploadId}`);
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Upload);
  },

  /**
   * Update upload metadata (title, description, visibility, thumbnail)
   */
  async updateUpload(
    uploadId: string,
    data: {
      title?: string;
      description?: string;
      visibility?: UploadVisibility;
      thumbnailUrl?: string;
    },
  ): Promise<Upload> {
    const res = await axiosClient.patch<ApiSuccessEnvelope<Upload> | Upload>(
      `/uploads/${uploadId}`,
      data,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Upload);
  },

  /**
   * Delete an upload
   */
  async deleteUpload(uploadId: string): Promise<{ success: boolean }> {
    const res = await axiosClient.delete<ApiSuccessEnvelope<{ success: boolean }> | { success: boolean }>(
      `/uploads/${uploadId}`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { success: boolean });
  },

  /**
   * Get channel uploads
   */
  async getChannelUploads(
    channelId: string,
    params?: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<Upload>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<Upload>> | PaginatedResponse<Upload>>(
      `/channels/${channelId}/uploads`,
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<Upload>);
  },
};
