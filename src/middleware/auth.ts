import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";
import { findUserById } from "../lib/userStore.js";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = findUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.userId = payload.userId;
  next();
}
