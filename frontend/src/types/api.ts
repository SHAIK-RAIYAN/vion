export type UserGender = "MALE" | "FEMALE" | "OTHER";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: UserGender;
  dob?: string | null;
  createdAt: string;
  channel?: Channel | null;
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
  uploadId?: string;
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
  category?: string | null;
  mood?: string | null;
  visualStyle?: string | null;
  colorTone?: string | null;
  environment?: string | null;
  tags?: string | null;
  searchScore?: number;
  matchReasons?: string[];
}

export interface PlaybackInfo {
  videoId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  streamType: "HLS" | "DIRECT";
  hlsManifestUrl?: string | null;
  manifestRoute: string;
  processingStatus: ProcessingStatus;
  isReady: boolean;
  visibility: UploadVisibility;
  renditions: VideoRendition[];
  channel?: {
    id: string;
    handle: string;
    channelName: string;
    profilePictureUrl?: string | null;
  } | null;
}

export interface LikeStatus {
  videoId: string;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
  userInteraction: "LIKE" | "DISLIKE" | null;
}

export interface VideoDownloadInfo {
  videoId: string;
  title: string;
  resolution: string;
  downloadUrl: string;
  fileName: string;
  expiresInSeconds: number;
  availableResolutions: string[];
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
  nextCursor?: string | null;
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

export interface Comment {
  id: string;
  userId: string;
  uploadId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    channel?: {
      id: string;
      handle: string;
      channelName: string;
      profilePictureUrl?: string | null;
    } | null;
  };
}

export interface Interaction {
  id: string;
  userId: string;
  uploadId: string;
  type: "LIKE" | "DISLIKE";
  createdAt: string;
}

export interface WatchHistoryItem {
  id: string;
  userId: string;
  uploadId: string;
  progressTimeStamp: number;
  watchedAt: string;
  upload?: Upload;
}

/** Canonical API Envelopes */
export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T = unknown> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
