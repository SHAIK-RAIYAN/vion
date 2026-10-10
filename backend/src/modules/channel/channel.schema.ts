import zod from "zod";

const createChannelSchema = zod.object({
  userId: zod.string(),
  handle: zod.string().min(3).max(60),
  channelName: zod.string(),
  bannerUrl: zod.string().optional(),
  profilePictureUrl: zod.string().optional(),
  description: zod.string().optional(),
});

type CreateChannel = zod.infer<typeof createChannelSchema>;

export type { CreateChannel };
export { createChannelSchema };
