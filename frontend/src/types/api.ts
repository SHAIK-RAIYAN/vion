export type UserGender = "MALE" | "FEMALE" | "OTHER";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: UserGender;
  dob?: string | null;
  createdAt: string;
}

export interface Channel {
  id: string;
  userId: string;
  handle: string;
  channelName: string;
  bannerUrl?: string | null;
  profilePictureUrl?: string | null;
  description?: string | null;
  createdAt: string;
  subscribers?: number;
  uploads?: number;
}

export type UploadVisibility = "PUBLIC" | "PRIVATE" | "UNLISTED";
export type ProcessingStatus =
  | "PENDING"
  | "UPLOADING"
  | "TRANSCODING"
  | "COMPLETED"
  | "FAILED";

export interface VideoRendition {
  id: string;
  uploadId: string;
  resolution: string;
  url: string;
}

export interface Upload {
  id: string;
  channelId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  hlsManifestUrl?: string | null;
  viewCount: number;
  isDeleted: boolean;
  visibility: UploadVisibility;
  processingStatus: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  channel?: {
    id: string;
    userId?: string;
    handle: string;
    channelName: string;
    profilePictureUrl?: string | null;
  };
  videos?: VideoRendition[];
  comments?: number;
  interactions?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  message?: string;
  items: T[];
  pagination: PaginationMeta;
}

export interface SubscriptionItem {
  id: string;
  subscriberId: string;
  channelId: string;
  createdAt: string;
  channel: {
    id: string;
    handle: string;
    channelName: string;
    profilePictureUrl?: string | null;
    description?: string | null;
  };
}
