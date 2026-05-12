import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config.js";

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function signToken(payload: { userId: string }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as never);
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as { userId: string };
  } catch {
    return null;
  }
}
