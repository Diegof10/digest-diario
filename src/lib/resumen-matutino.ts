import { readFile } from "fs/promises";
import path from "path";

/**
 * Chief of Staff morning brief — bundled txt snapshot.
 * Source of truth on shared box: /workspace/dhf-digest/latest.txt
 * Bundled copy (Vercel-readable): src/data/resumen-matutino.txt
 * Sync: scripts/sync-resumen-matutino.sh
 *
 * Format:
 *   fecha: YYYY-MM-DD ART
 *   titulo_ui: Resumen matutino
 *   <blank>
 *   ~6–10 content lines
 *
 * Never invents lines; empty/missing → caller uses auto-built fallback.
 */

export interface ResumenMatutinoParsed {
  fecha: string | null;
  tituloUi: string | null;
  lineas: string[];
  fuente: string;
  rawPath: string;
}

const SNAPSHOT_REL = path.join("src", "data", "resumen-matutino.txt");

export function snapshotPath(): string {
  return path.join(process.cwd(), SNAPSHOT_REL);
}

/** Parse CoS txt: skip header keys, blank separator, return body lines. */
export function parseResumenMatutinoTxt(raw: string): {
  fecha: string | null;
  tituloUi: string | null;
  lineas: string[];
} {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let fecha: string | null = null;
  let tituloUi: string | null = null;
  let i = 0;

  // Header key:value lines until blank
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      break;
    }
    const m = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "fecha") {
        // "2026-09-24 ART" → "2026-09-24"
        const d = val.match(/^(\d{4}-\d{2}-\d{2})/);
        fecha = d ? d[1] : val || null;
      } else if (key === "titulo_ui") {
        tituloUi = val || null;
      }
      i++;
      continue;
    }
    // Non-key content before blank — treat as body start
    break;
  }

  const lineas = lines
    .slice(i)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .filter((l) => !isPersonalAgendaLine(l));

  return { fecha, tituloUi, lineas };
}

/** Drop personal calendar / agenda lines — digest web is markets/FX/grains only. */
function isPersonalAgendaLine(line: string): boolean {
  const s = line.trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith("agenda:")) return true;
  if (s.startsWith("agenda ")) return true;
  if (s.includes("agenda personal")) return true;
  if (s.includes("reuniones") && (s.includes("recordatorio") || s.includes("agenda")))
    return true;
  return false;
}

export async function loadResumenMatutino(): Promise<ResumenMatutinoParsed | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    if (!raw.trim()) return null;
    const parsed = parseResumenMatutinoTxt(raw);
    return {
      ...parsed,
      fuente: "Chief of Staff",
      rawPath: SNAPSHOT_REL,
    };
  } catch {
    return null;
  }
}

/** Body lines if present; otherwise null (caller falls back). */
export async function getResumenMatutinoLineas(): Promise<string[] | null> {
  const snap = await loadResumenMatutino();
  if (!snap || snap.lineas.length === 0) return null;
  return snap.lineas;
}

/* ------------------------------------------------------------------ */
/* Resumen matutino con plazas vivas                                   */
/* ------------------------------------------------------------------ */

const PLAZA_LINE_RE = /^\s*(AFA\b|(?:Rosario\s+)?CAC\b|Pizarra\s+CAC\b|FOB\b)/i;

/**
 * Reemplaza las líneas AFA / CAC / FOB del texto CoS por las generadas del feed vivo
 * (mismo formato "precio (abs · %)"). El resto del texto se mantiene, marcado con su
 * fecha si está viejo (1–3 hábiles) y descartado si tiene >3 hábiles de atraso.
 * Si una plaza viva no tiene dato mostrable, su línea NO se reemplaza por texto viejo.
 */
export function mergeResumenConPlazas(
  cos: { fecha: string | null; lineas: string[] } | null,
  plazaLines: string[],
  opts: {
    frescuraDe: (fechaIso: string | null) => "fresco" | "viejo" | "vencido";
    fechaDm: (fechaIso: string | null) => string;
  },
): string[] | null {
  const out: string[] = [];
  let inserted = false;
  const insert = () => {
    if (!inserted) {
      out.push(...plazaLines);
      inserted = true;
    }
  };
  if (cos && cos.lineas.length > 0) {
    const est = opts.frescuraDe(cos.fecha);
    const dm = opts.fechaDm(cos.fecha);
    for (const line of cos.lineas) {
      if (PLAZA_LINE_RE.test(line)) {
        insert();
        continue;
      }
      if (est === "vencido") continue;
      if (est === "viejo") {
        const colon = line.indexOf(":");
        if (colon > 0 && colon < 40) {
          out.push(`${line.slice(0, colon)} (${dm} · viejo):${line.slice(colon + 1)}`);
        } else {
          out.push(`(${dm} · viejo) ${line}`);
        }
        continue;
      }
      out.push(line);
    }
    if (est === "vencido" && cos.fecha) {
      out.push(`Resto del resumen CoS del ${dm} omitido (más de 3 días hábiles).`);
    }
  }
  insert();
  return out.length > 0 ? out : null;
}
