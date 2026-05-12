import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists on start
const dataDir = join(__dirname, "..", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const app = express();
app.use(express.json({ limit: "5mb" }));

// Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`\n[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.method === "POST") {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`Response: ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "quran-be" });
});

app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// For Vercel deployment: export the app
export default app;

// Only listen if not running in a serverless environment
if (process.env.NODE_ENV !== "production") {
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`[quran-be] Server active on port ${config.port} (Network Accessible)`);
    if (!config.openaiApiKey) {
      console.warn("[quran-be] OPENAI_API_KEY is missing!");
    }
  });
}
