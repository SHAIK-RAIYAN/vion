import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import {
  createChannelSchema,
  updateChannelSchema,
  type CreateChannelInput,
  type UpdateChannelInput,
} from "./channel.schema";

const { Channel } = db.orm.public;

export async function createChannel(input: CreateChannelInput, userId: string) {
  const data = createChannelSchema.parse(input);

  const existingUserChannel = await Channel.where({ userId }).first();
  if (existingUserChannel) {
    throw new AppError("User already has a channel.", 409);
  }

  const handleExists = await Channel.where({ handle: data.handle }).first();
  if (handleExists) {
    throw new AppError("Channel handle is already taken.", 409);
  }

  const channel = await Channel.create({
    userId,
    handle: data.handle,
    channelName: data.channelName,
    bannerUrl: data.bannerUrl || null,
    profilePictureUrl: data.profilePictureUrl || null,
    description: data.description || null,
  });

  return channel;
}

export async function getMyChannel(userId: string) {
  const channel = await Channel.where({ userId })
    .include("subscribers", (s) => s.count())
    .include("uploads", (u) => u.count())
    .first();

  if (!channel) {
    throw new AppError("No channel found for this user.", 404);
  }

  return channel;
}

export async function getChannelById(id: string) {
  const channel = await Channel.where({ id })
    .include("subscribers", (s) => s.count())
    .include("uploads", (u) => u.count())
    .first();

  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  return channel;
}

export async function getChannelByHandle(handle: string) {
  const channel = await Channel.where({ handle })
    .include("subscribers", (s) => s.count())
    .include("uploads", (u) => u.count())
    .first();

  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  return channel;
}

export async function updateChannel(input: UpdateChannelInput, userId: string) {
  const data = updateChannelSchema.parse(input);

  const existingChannel = await Channel.where({ userId }).first();
  if (!existingChannel) {
    throw new AppError("Channel not found for this user.", 404);
  }

  if (data.handle && data.handle !== existingChannel.handle) {
    const handleExists = await Channel.where({ handle: data.handle }).first();
    if (handleExists) {
      throw new AppError("Channel handle is already taken.", 409);
    }
  }

  const updatedChannel = await Channel.where({ id: existingChannel.id }).update({
    ...(data.channelName ? { channelName: data.channelName } : {}),
    ...(data.handle ? { handle: data.handle } : {}),
    ...(data.bannerUrl !== undefined ? { bannerUrl: data.bannerUrl || null } : {}),
    ...(data.profilePictureUrl !== undefined ? { profilePictureUrl: data.profilePictureUrl || null } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
  });

  return updatedChannel;
}
