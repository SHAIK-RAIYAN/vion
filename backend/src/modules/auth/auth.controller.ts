import * as authservice from "./auth.service";
import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler";

const signUpUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authservice.signUpUser(req.body);

  res.status(200).json({ message: "Signup Successfull", data: user });
});

const signInUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authservice.signInUser(req.body);
});

export { signUpUser };
