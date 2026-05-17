import "dotenv/config";
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function main() {
  try {
    const res = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "hello" }],
    });
    console.log("Chat works!");
  } catch (e: any) {
    console.error("Chat error:", e.message);
  }
}

main();
