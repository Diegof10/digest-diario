import { readFile } from "fs/promises";
import path from "path";
import type { EtiquetaDato } from "@/lib/types";

/**
 * Noticias X / agro digest — dated snapshot only.
 * Never invent likes/views. Empty items or stale asOf → VACÍO.
 * Daily refresh: `node scripts/refresh-noticias.mjs` (routine 07:00 ARG).
 */

export interface NoticiasAccount {
  handle: string;
  focus: "local" | "intl" | string;
  why: string;
}

export interface NoticiasItem {
  handle: string;
  text: string;
  url?: string | null;
  likes?: number | null;
  views?: number | null;
  reposts?: number | null;
  publishedAt?: string | null;
  publishedAtArg?: string | null;
  /** true when engagement was not visible — rank by relevance/recency */
  metricsUnavailable?: boolean;
  relevance?: number | null;
}

export interface NoticiasFile {
  asOf: string | null;
  asOfArg?: string | null;
  maxAgeHours?: number;
  valor: string | null;
  note?: string | null;
  items: NoticiasItem[];
  accounts?: NoticiasAccount[];
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface NoticiasSnapshot {
  ok: boolean;
  valor: string | null;
  fuente: string | null;
  hora: string | null;
  url: string | null;
  extra: string | null;
  etiqueta: EtiquetaDato;
  items: NoticiasItem[];
  note: string;
  fetchedAt: string;
  asOf: string | null;
  maxAgeHours: number;
}

const SNAPSHOT_REL = path.join("src", "data", "noticias-snapshot.json");
const DEFAULT_MAX_AGE_H = 48;
const VALOR_MAX = 280;

function snapshotPath(): string {
  return path.join(process.cwd(), SNAPSHOT_REL);
}

function ageHours(asOfIso: string | null | undefined): number | null {
  if (!asOfIso) return null;
  const t = Date.parse(asOfIso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function horaArgFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Cordoba",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return null;
  }
}

function clipValor(s: string): string {
  const t = s.trim();
  if (t.length <= VALOR_MAX) return t;
  return t.slice(0, VALOR_MAX - 1) + "…";
}

/** Build short valor from items when snapshot.valor missing. */
export function buildValorFromItems(items: NoticiasItem[]): string | null {
  if (!items.length) return null;
  const lines = items.slice(0, 5).map((it) => {
    const snip =
      it.text.length > 90 ? it.text.slice(0, 87).trimEnd() + "…" : it.text;
    return `• ${snip} (@${it.handle.replace(/^@/, "")})`;
  });
  return clipValor(lines.join(" "));
}

function emptySnap(note: string): NoticiasSnapshot {
  return {
    ok: false,
    valor: null,
    fuente: null,
    hora: null,
    url: null,
    extra: null,
    etiqueta: "VACÍO",
    items: [],
    note,
    fetchedAt: new Date().toISOString(),
    asOf: null,
    maxAgeHours: DEFAULT_MAX_AGE_H,
  };
}

export async function loadNoticiasFile(): Promise<NoticiasFile | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    return JSON.parse(raw) as NoticiasFile;
  } catch {
    return null;
  }
}

/**
 * Read dated snapshot. Fresh = items.length > 0 AND asOf within maxAgeHours.
 * Stale or empty → ok:false / VACÍO (cell stays empty). Never invent metrics.
 */
export async function getNoticias(): Promise<NoticiasSnapshot> {
  const file = await loadNoticiasFile();
  if (!file) {
    return emptySnap(
      "Sin archivo noticias-snapshot.json — correr scripts/refresh-noticias.mjs",
    );
  }

  const maxAge = file.maxAgeHours ?? DEFAULT_MAX_AGE_H;
  const items = Array.isArray(file.items) ? file.items : [];
  const age = ageHours(file.asOf);

  if (items.length === 0 || !file.asOf) {
    return {
      ...emptySnap(
        file.note ||
          "Noticias vacío — sin posts frescos en snapshot (no se inventan likes).",
      ),
      maxAgeHours: maxAge,
      asOf: file.asOf,
    };
  }

  if (age != null && age > maxAge) {
    return {
      ...emptySnap(
        `Snapshot vencido (${age.toFixed(1)}h > ${maxAge}h). Último asOf ${file.asOfArg ?? file.asOf}. Refrescar a las 07:00 ARG.`,
      ),
      maxAgeHours: maxAge,
      asOf: file.asOf,
    };
  }

  const valor =
    (file.valor && file.valor.trim()) || buildValorFromItems(items) || null;
  if (!valor) {
    return {
      ...emptySnap("Items sin texto usable — VACÍO"),
      maxAgeHours: maxAge,
      asOf: file.asOf,
    };
  }

  const handles = [
    ...new Set(items.map((i) => `@${i.handle.replace(/^@/, "")}`)),
  ].slice(0, 4);
  const metricsNote = items.every(
    (i) => i.metricsUnavailable || (i.likes == null && i.views == null),
  )
    ? "métricas X no disponibles · ranking por relevancia/recencia"
    : null;

  const anyUrl = items.find((i) => i.url)?.url ?? null;

  return {
    ok: true,
    valor: clipValor(valor),
    fuente: `X ${handles.join(" ")}`,
    hora: file.asOfArg ?? horaArgFromIso(file.asOf),
    url: anyUrl,
    extra: metricsNote || file.note || null,
    etiqueta: "HECHO",
    items,
    note: file.note || `Snapshot noticias · ${items.length} items`,
    fetchedAt: new Date().toISOString(),
    asOf: file.asOf,
    maxAgeHours: maxAge,
  };
}
