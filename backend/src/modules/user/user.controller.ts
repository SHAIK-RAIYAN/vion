import { asyncHandler } from "../../utils/asyncHandler";
import type { Request, Response } from "express";

const getuser = (req: Request, res: Response) => {
  const user = req.user;
  return user;
};

export { getuser };
