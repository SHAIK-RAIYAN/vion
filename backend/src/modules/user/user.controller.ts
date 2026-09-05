import { asyncHandler } from "../../utils/asyncHandler";
import type { Request, Response } from "express";
import * as userService from "./user.service";

const getuser = (req: Request, res: Response) => {
  const user = req.user;
  res.status(200).json({ message: "User fetched successfully", data: user });
};

const updateUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new Error("No user data in Request");
  }

  const updatedUser = await userService.updateUser(req.body, req.user?.id);
  if (!updatedUser) {
    throw new Error("Error updating data. User not found");
  }

  req.user = {
    ...updatedUser,
    dob: updatedUser.dob?.toString() || "",
    createdAt: updatedUser.createdAt.toString(),
  };
  res
    .status(200)
    .json({ message: "Updated user data successfully", data: updatedUser });
});

const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new Error("No user data in Request");
  }

  const deletedUser = await userService.deleteUser(req.user?.id);

  return res
    .status(200)
    .json({ message: "Deleted user successfully", data: deletedUser });
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new Error("No user data in Request");
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new Error("Old Password and new password are required");
  }

  await userService.changePassword(req.user?.id, currentPassword, newPassword);

  res.status(200).json({ message: "Changed password successfully" });
});

export { getuser, updateUser, deleteUser, changePassword };
