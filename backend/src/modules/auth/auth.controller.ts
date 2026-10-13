import * as authservice from "./auth.service";
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { NODE_ENV } from "../../config/config";

const signUpUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authservice.signUpUser(req.body);

  res.status(201).json({
    success: true,
    message: "Signup Successful",
    data: user,
  });
});

const signInUser = asyncHandler(async (req: Request, res: Response) => {
  const { token, user } = await authservice.signInUser(req.body);

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "none" : "lax",
  });

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

  res.status(200).json({
    success: true,
    message: "SignIn Successful",
    token,
    data: { token, user },
    user,
  });
});

const googleAuthUser = asyncHandler(async (req: Request, res: Response) => {
  const { token, user } = await authservice.googleAuth(req.body);

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({
    success: true,
    message: "Google Authentication Successful",
    token,
    user,
    data: user,
  });

});

const signOutUser = asyncHandler((req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({
    success: true,
    message: "SignOut Successful",
    data: null,
  });
});

const getAuthMe = asyncHandler((req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.status(200).json({
    success: true,
    message: "Session authenticated",
    data: req.user,
  });
});

const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authservice.forgotPassword(req.body);
  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authservice.resetPassword(req.body);
  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

export {
  signUpUser,
  signInUser,
  googleAuthUser,
  signOutUser,
  getAuthMe,
  forgotPassword,
  resetPassword,
};

