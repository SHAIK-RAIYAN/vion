import { SALT_ROUNDS } from "../../config/config";
import { db } from "../../prisma/db";
import { updateUserSchema, type UpdateUserType } from "./user.schema";
import bcrypt from "bcrypt";

const { User } = db.orm.public;

async function updateUser(input: UpdateUserType, id: string) {
  const data = updateUserSchema.parse(input);

  const dataToUpdate: UpdateUserType = {
    firstName: data.firstName,
    lastName: data.lastName,
    gender: data.gender,
  };

  const updatedUser = await User.where({ id })
    .select(
      "id",
      "email",
      "firstName",
      "lastName",
      "gender",
      "dob",
      "createdAt",
      "updatedAt",
    )
    .update(dataToUpdate);

  if (!updatedUser) {
    throw new Error("User not found");
  }

  return updatedUser;
}

async function deleteUser(id: string) {
  const user = await User.where({ id }).delete();
  return user;
}

async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await User.select("password").first({ id });
  if (!user) {
    throw new Error("User not found.");
  }

  const isCorrectPass = await bcrypt.compare(currentPassword, user.password);
  if (!isCorrectPass) {
    throw new Error("Incorrect current password.");
  }

  const hashedNewPass = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await User.where({ id }).update({ password: hashedNewPass });
}

export { updateUser, deleteUser, changePassword };
