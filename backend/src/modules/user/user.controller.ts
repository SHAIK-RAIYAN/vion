import { asyncHandler } from "../../utils/asyncHandler";
import type { Request, Response } from "express";
import * as userService from "./user.service";

const getuser = (req: Request, res: Response) => {
  const user = req.user;
  res.status(200).json({ message: "User fetched successfully", data: user });
};

const updateUser = asyncHandler(async (req: Request, res: Response) => {
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

export { getuser, updateUser };
