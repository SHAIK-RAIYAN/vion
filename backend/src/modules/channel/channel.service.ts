import { db } from "../../prisma/db";
import { createChannelSchema, type CreateChannel } from "./channel.schema";

const { Channel } = db.orm.public;
async function createChannel(input: CreateChannel, id: string) {
  const data = createChannelSchema.parse(input);

  const channel = await Channel.create({ ...data, userId: id });
  if (!channel) {
    throw new Error("Channel not created.");
  }

  return channel;
}

export { createChannel };
