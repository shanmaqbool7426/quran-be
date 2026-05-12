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

app.get("/privacy", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Privacy Policy - Quran AI</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        h1 { color: #0D5C3A; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h2 { color: #222; margin-top: 30px; }
        .footer { margin-top: 50px; font-size: 14px; color: #777; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Effective Date: May 13, 2026</strong></p>
      <p>Quran AI - Learn & Recite ("the App") is committed to protecting your privacy. This policy explains how we handle information.</p>
      
      <h2>1. Information Collection</h2>
      <p>The App does not collect or store any personally identifiable information. You can use the app without an account.</p>
      
      <h2>2. Microphone Access</h2>
      <p>The App requires microphone access for the Recitation feature. Audio is processed in real-time and is not stored permanently on our servers.</p>
      
      <h2>3. AI Features</h2>
      <p>Text-based queries (Chat, Tafseer) are processed via secure AI providers. No personal identifiers are shared with these services.</p>
      
      <h2>4. Data Safety</h2>
      <p>We do not sell or share user data. Your bookmarks and progress are stored locally on your device.</p>

      <div class="footer">
        © 2026 Quran AI Team. Contact: support@islamicai.quran
      </div>
    </body>
    </html>
  `);
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
