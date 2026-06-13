import { Router } from "express";
import { z } from "zod";
import { logEvent, getAnalyticsStats } from "../lib/analyticsStore.js";

export const analyticsRouter = Router();

const eventPayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  eventName: z.string().min(1).max(100),
  params: z.record(z.any()).optional(),
  platform: z.string().optional(),
});

analyticsRouter.post("/events", (req, res) => {
  const parsed = eventPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { userId, eventName, params, platform } = parsed.data;
  const event = logEvent(userId ?? null, eventName, params ?? {}, platform ?? "unknown");

  res.status(201).json({ ok: true, eventId: event.id });
});

analyticsRouter.get("/stats", (_req, res) => {
  const stats = getAnalyticsStats();
  res.json(stats);
});
