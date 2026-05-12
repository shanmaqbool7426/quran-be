const ALQURAN = "https://api.alquran.cloud/v1";

export interface RetrievedAyah {
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
}

const REF_REGEX = /\b(\d{1,3})\s*[:：]\s*(\d{1,3})\b/g;

export function extractAyahRefsFromText(text: string, maxRefs: number): { surah: number; ayah: number }[] {
  const seen = new Set<string>();
  const out: { surah: number; ayah: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(REF_REGEX.source, "g");
  while ((m = re.exec(text)) !== null) {
    const surah = Number(m[1]);
    const ayah = Number(m[2]);
    if (surah < 1 || surah > 114 || ayah < 1) continue;
    const key = `${surah}:${ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ surah, ayah });
    if (out.length >= maxRefs) break;
  }
  return out;
}

async function fetchOneAyah(surah: number, ayah: number): Promise<RetrievedAyah | null> {
  try {
    const url = `${ALQURAN}/ayah/${surah}:${ayah}/editions/quran-uthmani,en.sahih`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ text?: string; numberInSurah?: number }>;
    };
    const editions = json.data;
    if (!Array.isArray(editions) || editions.length < 2) return null;
    const arabic = editions[0]?.text ?? "";
    const translation = editions[1]?.text ?? "";
    if (!arabic && !translation) return null;
    return { surah, ayah, arabic, translation };
  } catch {
    return null;
  }
}

/** Fetches ayat referenced like 2:255 in the given text (up to maxRefs). */
export async function retrieveQuranSnippets(
  userVisibleText: string,
  maxRefs = 3
): Promise<RetrievedAyah[]> {
  const refs = extractAyahRefsFromText(userVisibleText, maxRefs);
  const results: RetrievedAyah[] = [];
  for (const r of refs) {
    const row = await fetchOneAyah(r.surah, r.ayah);
    if (row) results.push(row);
  }
  return results;
}

export function formatRetrievalBlock(rows: RetrievedAyah[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map(
    (r) =>
      `Surah ${r.surah}:${r.ayah}\nArabic: ${r.arabic}\nTranslation (en.sahih): ${r.translation}`
  );
  return `Retrieved context (from alquran.cloud, for grounding only):\n\n${lines.join("\n\n---\n\n")}`;
}
