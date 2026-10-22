import { axiosClient } from "@/lib/axios";
import type { Upload, PaginatedResponse, ApiSuccessEnvelope } from "@/types/api";

export const searchService = {
  async search(
    query: string,
    params?: { page?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Upload>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<Upload>> | PaginatedResponse<Upload>>(
      "/search",
      {
        params: { q: query, ...params },
        signal,
      },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<Upload>);
  },

  async getSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
    const res = await axiosClient.get<ApiSuccessEnvelope<string[]> | string[]>(
      "/search/suggestions",
      {
        params: { q: query },
        signal,
      },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as string[]);
  },
};
