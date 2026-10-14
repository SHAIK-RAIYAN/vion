import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { isOriginAllowed } from "../index";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(error);
  }

  // Ensure CORS headers are attached on all error responses so browsers don't mask error payloads with CORS failure
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

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

