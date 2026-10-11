import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof ZodError) {
    const message = error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join(", ");
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: message || "Validation failed",
        details: error.issues,
      },
    });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
  if (error instanceof Error) {
    return res.status(400).json({
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: error.message,
      },
    });
  }
  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error.",
    },
  });
}

