import "dotenv/config";

function parseOrigins(raw: string | undefined): string | string[] | boolean {
  if (!raw || raw === "*") return true;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0]! : parts;
}

export const config = {
  port: Number(process.env["PORT"] ?? 8080),
  openaiApiKey: process.env["OPENAI_API_KEY"] ?? "",
  openaiModel: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
  openaiBaseUrl: process.env["OPENAI_BASE_URL"]?.trim() || undefined,
  corsOrigin: parseOrigins(process.env["CORS_ORIGIN"]),
  maxChatContextChars: Number(process.env["MAX_CHAT_CONTEXT_CHARS"] ?? 12_000),
  jwtSecret: process.env["JWT_SECRET"] ?? "change-me-in-production",
  jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
};
