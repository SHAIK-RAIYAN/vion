import zod from "zod";

const createChannelSchema = zod.object({
  handle: zod
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(60, "Handle cannot exceed 60 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Handle can only contain letters, numbers, underscores, dots, and hyphens"),
  channelName: zod.string().min(1, "Channel name is required").max(100),
  bannerUrl: zod.string().url().optional().or(zod.literal("")),
  profilePictureUrl: zod.string().url().optional().or(zod.literal("")),
  description: zod.string().max(1000).optional(),
});

const updateChannelSchema = zod.object({
  handle: zod
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .optional(),
  channelName: zod.string().min(1).max(100).optional(),
  bannerUrl: zod.string().url().optional().or(zod.literal("")),
  profilePictureUrl: zod.string().url().optional().or(zod.literal("")),
  description: zod.string().max(1000).optional(),
});

type CreateChannelInput = zod.infer<typeof createChannelSchema>;
type UpdateChannelInput = zod.infer<typeof updateChannelSchema>;

export { createChannelSchema, updateChannelSchema };
export type { CreateChannelInput, UpdateChannelInput };
