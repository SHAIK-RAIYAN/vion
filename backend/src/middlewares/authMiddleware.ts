import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/config";
import { AppError } from "../utils/AppError";

function extractToken(req: Request): string | undefined {
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return undefined;
}

export const authMiddleware = asyncHandler(
  (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      throw new AppError("Authentication token missing.", 401);
    }

    if (!JWT_SECRET) {
      throw new AppError("JWT secret is not defined.", 500);
    }

    try {
      const decodedUser = jwt.verify(token, JWT_SECRET) as NonNullable<
        Request["user"]
      >;
      req.user = decodedUser;
      next();
    } catch {
      throw new AppError("Invalid or expired authentication token.", 401);
    }
  },
);

export const optionalAuthMiddleware = asyncHandler(
  (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token || !JWT_SECRET) {
      return next();
    }

    try {
      const decodedUser = jwt.verify(token, JWT_SECRET) as NonNullable<
        Request["user"]
      >;
      req.user = decodedUser;
    } catch {
      // Ignored for optional auth
    }
    next();
  },
);
