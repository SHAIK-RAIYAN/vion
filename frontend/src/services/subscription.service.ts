import { axiosClient } from "@/lib/axios";
import type { SubscriptionItem, PaginatedResponse, ApiSuccessEnvelope } from "@/types/api";

export const subscriptionService = {
  async subscribe(channelId: string): Promise<{ success: boolean; isSubscribed: boolean }> {
    const res = await axiosClient.post<
      ApiSuccessEnvelope<{ success: boolean; isSubscribed: boolean }> | { success: boolean; isSubscribed: boolean }
    >(`/channels/${channelId}/subscribe`);
    return "data" in res.data && res.data.success ? res.data.data : res.data;
  },

  async unsubscribe(channelId: string): Promise<{ success: boolean; isSubscribed: boolean }> {
    const res = await axiosClient.delete<
      ApiSuccessEnvelope<{ success: boolean; isSubscribed: boolean }> | { success: boolean; isSubscribed: boolean }
    >(`/channels/${channelId}/subscribe`);
    return "data" in res.data && res.data.success ? res.data.data : res.data;
  },

  async getSubscriptionStatus(
    channelId: string,
  ): Promise<{ isSubscribed: boolean }> {
    const res = await axiosClient.get<ApiSuccessEnvelope<{ isSubscribed: boolean }> | { isSubscribed: boolean }>(
      `/channels/${channelId}/subscription`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as { isSubscribed: boolean });
  },

  async getMySubscriptions(params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<SubscriptionItem>> {
    const res = await axiosClient.get<ApiSuccessEnvelope<PaginatedResponse<SubscriptionItem>> | PaginatedResponse<SubscriptionItem>>(
      "/users/me/subscriptions",
      { params },
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as PaginatedResponse<SubscriptionItem>);
  },
};
