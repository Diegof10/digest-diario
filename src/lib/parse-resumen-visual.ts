import type { CropKey } from "@/components/CropIcons";

export type CropQuote = {
  crop: CropKey;
  price: string;
  unit?: string;
  change?: string; // "+0,6%" | "plano" | "−0,1%"
};

export type PlazaBlock = {
  plaza: string; // CBOT | AFA | CAC | etc
  detail?: string; // "San Martín (23/09)"
  quotes: CropQuote[];
};

export type ResumenVisual = {
  plazas: PlazaBlock[];
  extras: string[]; // FX, Mercados, FOB, etc.
};

const CROP_RE = /\b(soja|ma[ií]z|trigo)\b/gi;

function normCrop(raw: string): CropKey | null {
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (s === "soja") return "soja";
  if (s === "maiz") return "maiz";
  if (s === "trigo") return "trigo";
  return null;
}

/** Parse "soja 486,9 US$/t (+0,6%)" fragments. */
function parseQuotes(segment: string): CropQuote[] {
  const out: CropQuote[] = [];
  // split on · or |
  const parts = segment.split(/\s*[·|]\s*/);
  for (const part of parts) {
    const m = part.match(
      /(soja|ma[ií]z|trigo)\s+([0-9][0-9.,]*)\s*(US\$\/t|\$\/t|USD\/t)?\s*(?:\(([^)]+)\))?/i,
    );
    if (!m) continue;
    const crop = normCrop(m[1]);
    if (!crop) continue;
    out.push({
      crop,
      price: m[2],
      unit: m[3]?.replace("USD", "US$"),
      change: m[4]?.trim(),
    });
  }
  return out;
}

function isCropPlazaLine(line: string): boolean {
  const lower = line.toLowerCase();
  const hasCrop = CROP_RE.test(line);
  CROP_RE.lastIndex = 0;
  if (!hasCrop) return false;
  return (
    /^(cbot|afa|cac|rosario|fob|matba|chicago)/i.test(line.trim()) ||
    (lower.includes("soja") && lower.includes("ma") && lower.includes("trigo"))
  );
}

export function parseResumenVisual(lines: string[]): ResumenVisual {
  const plazas: PlazaBlock[] = [];
  const extras: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!isCropPlazaLine(trimmed)) {
      extras.push(trimmed);
      continue;
    }

    // "CBOT: soja ... · maíz ..."
    // "AFA San Martín (23/09): soja ..."
    // "Rosario CAC (22/09): soja ..."
    const colon = trimmed.indexOf(":");
    let head = trimmed;
    let body = trimmed;
    if (colon > 0 && colon < 40) {
      head = trimmed.slice(0, colon).trim();
      body = trimmed.slice(colon + 1).trim();
    }

    let plaza = head;
    let detail: string | undefined;
    const mAfa = head.match(/^AFA\s+(.+)$/i);
    const mCac = head.match(/^(?:Rosario\s+)?CAC\s*(.*)$/i);
    const mCbot = head.match(/^CBOT\b(.*)$/i);
    const mFob = head.match(/^FOB\b(.*)$/i);
    if (mAfa) {
      plaza = "AFA";
      detail = mAfa[1].trim() || undefined;
    } else if (mCac) {
      plaza = "CAC";
      const rest = (mCac[1] || "").trim();
      detail = rest
        ? (head.toLowerCase().startsWith("rosario") ? `Rosario ${rest}`.trim() : rest)
        : (head.toLowerCase().includes("rosario") ? "Rosario" : undefined);
    } else if (mCbot) {
      plaza = "CBOT";
      detail = mCbot[1].trim() || undefined;
    } else if (mFob) {
      plaza = "FOB";
      detail = mFob[1].trim() || undefined;
    }

    const quotes = parseQuotes(body);
    if (quotes.length === 0) {
      extras.push(trimmed);
      continue;
    }
    plazas.push({ plaza, detail, quotes });
    // leftover after last crop (e.g. FAS ~370 / 192 / 231)
    const leftover = body.replace(
      /(soja|ma[ií]z|trigo)\s+[0-9][0-9.,]*\s*(US\$\/t|\$\/t|USD\/t)?\s*(?:\([^)]+\))?\s*[·|]?\s*/gi,
      "",
    ).trim().replace(/^[·|\s]+/, "");
    if (leftover && /[a-zA-Záéíóú]/i.test(leftover)) {
      extras.push(`${plaza}${detail ? " " + detail : ""}: ${leftover}`);
    }
  }

  return { plazas, extras };
}

export function changeTone(change?: string): "up" | "down" | "flat" | "none" {
  if (!change) return "none";
  const s = change.toLowerCase();
  if (s.includes("plano") || s === "0%" || s === "0,0%" || s === "+0%" || s === "+0,0%")
    return "flat";
  if (/^[+＋]/.test(change) || /\+[0-9]/.test(change)) return "up";
  if (/^[−\-–]/.test(change) || /%[−\-–]/.test(change)) return "down";
  if (change.includes("−") || change.includes("–")) return "down";
  return "flat";
}
