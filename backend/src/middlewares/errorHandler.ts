import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: error.issues });
  }
  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }
  return res.status(500).json({ message: "Internal Server Error." });
}
