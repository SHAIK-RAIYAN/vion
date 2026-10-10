import * as authservice from "./auth.service";
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { NODE_ENV } from "../../config/config";

const signUpUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authservice.signUpUser(req.body);

  res.status(200).json({ message: "Signup Successfull", data: user });
});

const signInUser = asyncHandler(async (req: Request, res: Response) => {
  const token = await authservice.signInUser(req.body);

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({ message: "SignIn Successfull", token });
});

const googleAuthUser = asyncHandler(async (req: Request, res: Response) => {
  const { token, user } = await authservice.googleAuth(req.body);

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({
    message: "Google Authentication Successfull",
    token,
    data: user,
  });
});

const signOutUser = asyncHandler((req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({ message: "SignOut Successfull" });
});

export { signUpUser, signInUser, googleAuthUser, signOutUser };
