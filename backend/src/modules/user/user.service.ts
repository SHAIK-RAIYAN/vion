import { db } from "../../prisma/db";
import { updateUserSchema, type UpdateUserType } from "./user.schema";

const { User } = db.orm.public;

async function updateUser(input: UpdateUserType, id: string | undefined) {
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

export { updateUser };
