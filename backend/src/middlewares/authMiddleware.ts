import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../shared/utils/asyncHandler";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/config";

type decodeTokenSchema = {
  id: string;
  email: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  firstName: string;
  lastName: string;
  dob: string;
  createdAt: string;
};

export const authMiddleware = asyncHandler(
  (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.cookies;
    if (!token) {
      throw new Error("Authentication token Missing.");
    }

    if (!JWT_SECRET) {
      throw new Error("Jwt secret is not defined.");
    }

    const decodedUser = jwt.verify(token, JWT_SECRET) as decodeTokenSchema;

    (req as Request & { user: decodeTokenSchema }).user = decodedUser;

    next();
  },
);
