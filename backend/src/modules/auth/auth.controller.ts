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

  res.status(200).json({ message: "SignIn Successfull" });
});

export { signUpUser, signInUser };
