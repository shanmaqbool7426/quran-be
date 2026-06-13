import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const EVENTS_PATH = join(DATA_DIR, "events.json");

export interface AppEvent {
  id: string;
  userId: string | null;
  eventName: string;
  params: Record<string, any>;
  timestamp: string;
  platform: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(EVENTS_PATH)) writeFileSync(EVENTS_PATH, "[]", "utf-8");
}

function readEvents(): AppEvent[] {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(EVENTS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeEvents(events: AppEvent[]): void {
  ensureDataDir();
  writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), "utf-8");
}

export function logEvent(
  userId: string | null,
  eventName: string,
  params: Record<string, any> = {},
  platform: string = "unknown"
): AppEvent {
  const events = readEvents();
  const event: AppEvent = {
    id: randomUUID(),
    userId,
    eventName,
    params,
    timestamp: new Date().toISOString(),
    platform,
  };
  events.push(event);

  // Keep a rolling log capped at 10,000 events to prevent data bloat in json file
  if (events.length > 10000) {
    events.shift();
  }

  writeEvents(events);
  return event;
}

export interface AnalyticsStats {
  totalEvents: number;
  eventsBreakdown: Record<string, number>;
  platformBreakdown: Record<string, number>;
  uniqueUsers: number;
  recentLogs: AppEvent[];
}

export function getAnalyticsStats(): AnalyticsStats {
  const events = readEvents();
  const eventsBreakdown: Record<string, number> = {};
  const platformBreakdown: Record<string, number> = {};
  const userIds = new Set<string>();

  events.forEach((e) => {
    eventsBreakdown[e.eventName] = (eventsBreakdown[e.eventName] ?? 0) + 1;
    platformBreakdown[e.platform] = (platformBreakdown[e.platform] ?? 0) + 1;
    if (e.userId) {
      userIds.add(e.userId);
    }
  });

  return {
    totalEvents: events.length,
    eventsBreakdown,
    platformBreakdown,
    uniqueUsers: userIds.size,
    recentLogs: events.slice(-30).reverse(), // Last 30 logs, newest first
  };
}
