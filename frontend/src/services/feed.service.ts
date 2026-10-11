import { axiosClient } from "@/lib/axios";
import type { Upload, PaginatedResponse, ApiSuccessEnvelope } from "@/types/api";

export const feedService = {
  async getFeed(params?: {
    page?: number;
    limit?: number;
    category?: string;
  }): Promise<PaginatedResponse<Upload>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<Upload>> | PaginatedResponse<Upload>>(
      "/feed",
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<Upload>);
  },
};
