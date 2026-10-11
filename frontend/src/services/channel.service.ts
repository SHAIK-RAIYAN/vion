import { axiosClient } from "@/lib/axios";
import type { Channel, ApiSuccessEnvelope } from "@/types/api";

export interface CreateChannelDto {
  channelName: string;
  handle: string;
  description?: string;
}

export const channelService = {
  async getMyChannel(): Promise<Channel> {
    const res = await axiosClient.get<ApiSuccessEnvelope<Channel> | Channel>("/channels/me");
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Channel);
  },

  async getChannelById(channelId: string): Promise<Channel> {
    const res = await axiosClient.get<ApiSuccessEnvelope<Channel> | Channel>(`/channels/${channelId}`);
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Channel);
  },

  async getChannelByHandle(handle: string): Promise<Channel> {
    const cleanHandle = handle.startsWith("@") ? handle.substring(1) : handle;
    const res = await axiosClient.get<ApiSuccessEnvelope<Channel> | Channel>(
      `/channels/handle/${cleanHandle}`,
    );
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Channel);
  },

  async createChannel(dto: CreateChannelDto): Promise<Channel> {
    const res = await axiosClient.post<ApiSuccessEnvelope<Channel> | Channel>("/channels", dto);
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Channel);
  },

  async updateChannel(data: {
    channelName?: string;
    description?: string;
    bannerUrl?: string;
    profilePictureUrl?: string;
  }): Promise<Channel> {
    const res = await axiosClient.patch<ApiSuccessEnvelope<Channel> | Channel>("/channels/me", data);
    return "data" in res.data && res.data.success ? res.data.data : (res.data as Channel);
  },
};
