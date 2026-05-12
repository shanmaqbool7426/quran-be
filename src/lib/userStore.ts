import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const USERS_PATH = join(DATA_DIR, "users.json");

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(USERS_PATH)) writeFileSync(USERS_PATH, "[]", "utf-8");
}

function readUsers(): StoredUser[] {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(USERS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  ensureDataDir();
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return readUsers().find((u) => u.email === email.toLowerCase());
}

export function findUserById(id: string): StoredUser | undefined {
  return readUsers().find((u) => u.id === id);
}

export function createUser(email: string, name: string, passwordHash: string): StoredUser {
  const users = readUsers();
  const user: StoredUser = {
    id: randomUUID(),
    email: email.toLowerCase(),
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return user;
}
