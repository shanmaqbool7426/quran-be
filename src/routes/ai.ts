import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Router } from "express";
import { createReadStream, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { getOpenAI } from "../lib/openai.js";
import { formatRetrievalBlock, retrieveQuranSnippets } from "../lib/quranRetrieval.js";
import { initSse, sseData } from "../lib/sse.js";
import {
  INSIGHT_SYSTEM,
  ISLAMIC_SCHOLAR_SYSTEM,
  TAFSEER_SYSTEM,
} from "../prompts/islamicScholar.js";

export const aiRouter = Router();

// Connection Test Route
aiRouter.get("/test", (req, res) => {
  console.log(`[ai-be] Connectivity test received from ${req.ip}`);
  res.json({ 
    status: "connected", 
    timestamp: new Date().toISOString(),
    message: "Backend is reachable from your device!" 
  });
});

// ── Arabic helpers ────────────────────────────────────────────────────────────
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A]/g, "")  // strip tashkeel
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")     // alef variants
    .replace(/\u0629/g, "\u0647")                          // ta marbuta
    .replace(/\u0649/g, "\u064A")                          // alef maqsura
    .replace(/\s+/g, " ").trim();
}

function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  let matches = 0;
  const bArr = b.split("");
  for (const ch of a.split("")) {
    const idx = bArr.indexOf(ch);
    if (idx !== -1) { matches++; bArr.splice(idx, 1); }
  }
  return matches / maxLen;
}

// ── POST /recitation — Whisper transcription + honest scoring ─────────────────
aiRouter.post("/recitation", async (req, res) => {
  if (!config.openaiApiKey) {
    res.status(503).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }
  const { audioBase64, mimeType = "audio/m4a", expectedArabic } = req.body ?? {};
  if (!audioBase64 || !expectedArabic) {
    res.status(400).json({ error: "Missing audioBase64 or expectedArabic" });
    return;
  }

  const ext = mimeType.includes("webm") ? "webm"
    : mimeType.includes("ogg") ? "ogg"
    : mimeType.includes("wav") ? "wav" : "m4a";
  const tmpPath = join(tmpdir(), `rec_${randomBytes(8).toString("hex")}.${ext}`);

  try {
    writeFileSync(tmpPath, Buffer.from(audioBase64, "base64"));

    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tmpPath) as any,
      model: config.openaiBaseUrl?.includes("groq") ? "whisper-large-v3-turbo" : "whisper-1",
      language: "ar",
      response_format: "text",
    });
    const transcript = (typeof transcription === "string"
      ? transcription
      : (transcription as any).text ?? "").trim();

    // Word-by-word comparison
    const refWords = normalizeArabic(expectedArabic).split(" ").filter(Boolean);
    const gotWords = normalizeArabic(transcript).split(" ").filter(Boolean);
    const originalWords = expectedArabic.split(" ").filter(Boolean);

    const feedback: { word: string; status: "correct"|"intermediate"|"wrong"; got: string }[] = [];
    let totalSim = 0;
    for (let i = 0; i < refWords.length; i++) {
      const ref = refWords[i]!;
      const got = gotWords[i] ?? "";
      const sim = wordSim(ref, got);
      totalSim += sim;
      feedback.push({
        word: originalWords[i] ?? ref,
        got,
        status: sim >= 0.82 ? "correct" : sim >= 0.45 ? "intermediate" : "wrong",
      });
    }
    const extraPenalty = Math.max(0, gotWords.length - refWords.length) * 0.6;
    const score = Math.max(0, Math.min(100,
      refWords.length > 0 ? Math.round(((totalSim - extraPenalty) / refWords.length) * 100) : 0
    ));

    console.log(`[recitation] transcript="${transcript}" score=${score}`);
    res.json({ score, transcript, feedback });
  } catch (e) {
    console.error("[recitation] Error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
  }
});

type ClientMsg = { role: "user" | "assistant"; content: string };

function isClientMsg(x: unknown): x is ClientMsg {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (o["role"] === "user" || o["role"] === "assistant") && typeof o["content"] === "string";
}

function trimHistory(msgs: ClientMsg[], maxChars: number): ClientMsg[] {
  let total = 0;
  const out: ClientMsg[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    const len = m.content.length;
    if (total + len > maxChars) break;
    out.unshift(m);
    total += len;
  }
  return out;
}

function lastUserText(msgs: ClientMsg[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === "user") return msgs[i]!.content;
  }
  return "";
}

const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;
const ROMAN_URDU_WORDS =
  /\b(?:hai|ho|hain|tha|the|thi|thay|kya|kyun|kaise|kesy|kese|acha|accha|bhot|bahut|shukrya|shukriya|khushi|ap|tum|woh|yeh|mera|meri|tumhara|aap|aapka|chahiye|sakta|sakti|kar|karo|karta|karti|raha|rahi|rahe|hoga|hogee|nahi|nai|nhe|hmm|han|haan|ji)\b/i;

function detectLanguage(text: string): string {
  if (ARABIC_PATTERN.test(text)) return "Arabic-script language (Arabic, Urdu, Farsi, etc.)";
  if (ROMAN_URDU_WORDS.test(text)) return "Roman Urdu (Urdu written in Latin/English script)";
  return "the user's language";
}

aiRouter.post("/chat", async (req, res) => {
  console.log("[ai-be] Received /chat request");
  const raw = req.body?.messages;
  if (!Array.isArray(raw) || !raw.every(isClientMsg)) {
    res.status(400).json({ error: "Expected body: { messages: { role, content }[] }" });
    return;
  }

  // Check for image/vision content - reject gracefully
  const hasImageContent = raw.some(m => {
    const c = m.content.toLowerCase();
    return c.includes("data:image") || c.includes(".png") || c.includes(".jpg") || c.includes("base64") || c.includes("http") && c.includes("image");
  });
  if (hasImageContent) {
    res.status(400).json({ error: "Image input is not supported. This AI assistant responds to text questions about Islam only." });
    return;
  }

  if (!config.openaiApiKey) {
    res.status(503).json({
      error: "AI backend is not configured. Set OPENAI_API_KEY in quran-be/.env",
    });
    return;
  }

  const history = trimHistory(raw, config.maxChatContextChars);
  const retrievalSource = [lastUserText(history), ...history.slice(-3).map((m) => m.content)].join(
    "\n"
  );
  let retrievalBlock = "";
  try {
    const snippets = await retrieveQuranSnippets(retrievalSource, 3);
    retrievalBlock = formatRetrievalBlock(snippets);
  } catch {
    retrievalBlock = "";
  }

  const userLang = detectLanguage(lastUserText(history));
  const langInstruction = `IMPORTANT: Respond in ${userLang}. Never mix languages in your response.`;
  const systemContent = `${ISLAMIC_SCHOLAR_SYSTEM}\n\n${langInstruction}${retrievalBlock ? `\n\n${retrievalBlock}` : ""}`;

  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  initSse(res);

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create(
      {
        model: config.openaiModel,
        messages: openaiMessages,
        stream: true,
        temperature: 0.35,
        max_tokens: 2048,
      },
      { signal: abort.signal }
    );

    let fullResponse = "";
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        process.stdout.write("."); // Keep showing dots for progress
        sseData(res, { content: delta });
      }
    }
    console.log("\n[ai-be] FULL AI RESPONSE:");
    console.log("--------------------------------------------------");
    console.log(fullResponse);
    console.log("--------------------------------------------------");
    console.log("[ai-be] Stream finished successfully\n");
    sseData(res, { done: true });
    res.end();
  } catch (e) {
    console.error("[ai-be] Streaming Chat Error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    sseData(res, { error: msg });
    sseData(res, { done: true });
    res.end();
  }
});

// Non-streaming fallback for better compatibility
aiRouter.post("/chat-sync", async (req, res) => {
  const raw = req.body?.messages;
  if (!Array.isArray(raw) || !raw.every(isClientMsg)) {
    return res.status(400).json({ error: "Invalid messages" });
  }

  // Check for image/vision content - reject gracefully
  const hasImageContent = raw.some(m => {
    const c = m.content.toLowerCase();
    return c.includes("data:image") || c.includes(".png") || c.includes(".jpg") || c.includes("base64") || c.includes("http") && c.includes("image");
  });
  if (hasImageContent) {
    return res.status(400).json({ error: "Image input is not supported. This AI assistant responds to text questions about Islam only." });
  }

  const history = trimHistory(raw, config.maxChatContextChars);
  const retrievalSource = [lastUserText(history), ...history.slice(-3).map((m) => m.content)].join("\n");
  
  let retrievalBlock = "";
  try {
    const snippets = await retrieveQuranSnippets(retrievalSource, 3);
    retrievalBlock = formatRetrievalBlock(snippets);
  } catch {}

  const userLang = detectLanguage(lastUserText(history));
  const langInstruction = `IMPORTANT: Respond in ${userLang}. Never mix languages in your response.`;
  const systemContent = `${ISLAMIC_SCHOLAR_SYSTEM}\n\n${langInstruction}${retrievalBlock ? `\n\n${retrievalBlock}` : ""}`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: [
        { role: "system", content: systemContent },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.35,
      max_tokens: 2048,
    });

    const content = completion.choices[0]?.message?.content || "";
    console.log("\n[ai-be] FULL AI RESPONSE (SYNC):");
    console.log("--------------------------------------------------");
    console.log(content);
    console.log("--------------------------------------------------");
    res.json({ content });
  } catch (e) {
    console.error("[ai-be] Sync Chat Error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

aiRouter.post("/tafseer", async (req, res) => {
  if (!config.openaiApiKey) {
    res.status(503).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  const b = req.body ?? {};
  const surahId = Number(b.surahId);
  const ayahNumber = Number(b.ayahNumber);
  const surahName = typeof b.surahName === "string" ? b.surahName : "Surah";
  const arabicText = typeof b.arabicText === "string" ? b.arabicText : "";
  const translation = typeof b.translation === "string" ? b.translation : "";
  const language = typeof b.language === "string" ? b.language : "English";
  const scholar = typeof b.scholar === "string" ? b.scholar : "";

  if (!Number.isFinite(surahId) || !Number.isFinite(ayahNumber) || surahId < 1 || surahId > 114) {
    res.status(400).json({ error: "Invalid surahId or ayahNumber" });
    return;
  }

  const scholarStyle = scholar
    ? `Write the tafseer in the scholarly style of ${scholar}. Emulate their methodology, emphasis, and approach to Quranic exegesis.`
    : "";

  const userBlock = `Surah: ${surahName} (${surahId})
Ayah number in surah: ${ayahNumber}
Target language for explanation: ${language}

Arabic:
${arabicText}

Translation (app user's edition):
${translation}

${scholarStyle || `Write the tafseer in ${language}.`}`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.25,
      max_tokens: 1200,
      messages: [
        { role: "system", content: TAFSEER_SYSTEM },
        { role: "user", content: userBlock },
      ],
    });
    const tafseer = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ tafseer, surahId, ayahNumber });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

aiRouter.post("/insights", async (req, res) => {
  if (!config.openaiApiKey) {
    res.status(503).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  const b = req.body ?? {};
  const arabic = typeof b.arabic === "string" ? b.arabic : "";
  const translation = typeof b.translation === "string" ? b.translation : "";
  const reference = typeof b.reference === "string" ? b.reference : "";

  if (!arabic && !translation) {
    res.status(400).json({ error: "Expected arabic and/or translation" });
    return;
  }

  const userBlock = `Reference: ${reference}
Arabic:
${arabic}

Translation:
${translation}`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.4,
      max_tokens: 350,
      messages: [
        { role: "system", content: INSIGHT_SYSTEM },
        { role: "user", content: userBlock },
      ],
    });
    const insight = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ insight });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});
