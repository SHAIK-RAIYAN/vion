import { asyncHandler } from "../../utils/asyncHandler";
import type { Request, Response } from "express";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as userService from "./user.service";
import * as subscriptionService from "../subscription/subscription.service";

const getUser = (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }
  const user = req.user;
  res.status(200).json({
    success: true,
    message: "User profile fetched successfully",
    data: user,
  });
};

const updateUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const updatedUser = await userService.updateUser(req.body, req.user.id);
  if (!updatedUser) {
    throw new AppError("User not found", 404);
  }

  req.user = {
    ...updatedUser,
    dob: updatedUser.dob?.toString() || "",
    createdAt: updatedUser.createdAt.toString(),
  };

  res.status(200).json({
    success: true,
    message: "Updated user profile successfully",
    data: updatedUser,
  });
});

const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const deletedUser = await userService.deleteUser(req.user.id);

  return res.status(200).json({
    success: true,
    message: "Deleted user successfully",
    data: deletedUser,
  });
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("Old password and new password are required.", 400);
  }

  await userService.changePassword(req.user.id, currentPassword, newPassword);

  res.status(200).json({
    success: true,
    message: "Changed password successfully",
    data: null,
  });
});

const getUserSubscriptions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await subscriptionService.getMySubscriptions(
    req.user.id,
    pagination,
  );

  res.status(200).json({
    success: true,
    message: "Subscriptions fetched successfully",
    data: result,
    ...result,
  });
});

export {
  getUser,
  updateUser,
  deleteUser,
  changePassword,
  getUserSubscriptions,
};

