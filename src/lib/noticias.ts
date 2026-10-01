import { readFile } from "fs/promises";
import path from "path";
import type { EtiquetaDato } from "@/lib/types";
import { readNoticiasBlob } from "@/lib/noticias-cron";

/**
 * Noticias agro — snapshot fechado de EVENTOS que mueven la decisión del
 * productor (nunca movimientos de precio). Máx. 5 items: título del medio,
 * fuente, fecha/hora y link verificado. Stale asOf → VACÍO.
 * Sin items pero con `valor` fresco (p.ej. "sin noticias nuevas · 25/9") → se muestra el valor.
 */

export interface NoticiasAccount {
  handle: string;
  focus: "local" | "intl" | string;
  why: string;
}

export interface NoticiasItem {
  /** Título tal cual lo publica el medio */
  title?: string | null;
  /** Medio / fuente */
  source?: string | null;
  /** Legacy: nombre corto de la fuente */
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
  /** "Sin noticias nuevas · HH:MM" cuando la última tanda no trajo nada nuevo */
  aviso?: string | null;
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
  aviso?: string | null;
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
    const t = (it.title || it.text || "").trim();
    const snip = t.length > 90 ? t.slice(0, 87).trimEnd() + "…" : t;
    return `• ${snip} (${it.source || it.handle})`;
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

async function loadRepoFile(): Promise<NoticiasFile | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    return JSON.parse(raw) as NoticiasFile;
  } catch {
    return null;
  }
}

/** El más nuevo entre el Blob del cron (noticias/latest.json) y el snapshot del repo. */
export async function loadNoticiasFile(): Promise<NoticiasFile | null> {
  const [repo, blob] = await Promise.all([
    loadRepoFile(),
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
      ? readNoticiasBlob().catch(() => null)
      : Promise.resolve(null),
  ]);
  const t = (f: NoticiasFile | null) => (f?.asOf ? Date.parse(f.asOf) || 0 : 0);
  if (!blob) return repo;
  if (!repo) return blob;
  return t(blob) >= t(repo) ? blob : repo;
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

  if (items.length === 0 && file.asOf && file.valor?.trim() && (age == null || age <= maxAge)) {
    return {
      ok: true,
      valor: clipValor(file.valor),
      fuente: null,
      hora: file.asOfArg ?? horaArgFromIso(file.asOf),
      url: null,
      extra: null,
      etiqueta: "HECHO",
      items: [],
      note: file.note || "Sin noticias nuevas",
      fetchedAt: new Date().toISOString(),
      asOf: file.asOf,
      maxAgeHours: maxAge,
    };
  }

  if (items.length === 0 || !file.asOf) {
    return {
      ...emptySnap(
        file.note ||
          "Noticias vacío — sin items frescos en snapshot.",
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

  const sources = [
    ...new Set(items.map((i) => (i.source || i.handle).replace(/^@/, ""))),
  ].slice(0, 5);
  const anyUrl = items.find((i) => i.url)?.url ?? null;

  return {
    ok: true,
    valor: clipValor(valor),
    fuente: sources.join(" · "),
    hora: file.asOfArg ?? horaArgFromIso(file.asOf),
    url: anyUrl,
    extra: null,
    etiqueta: "HECHO",
    items,
    note: file.note || `Snapshot noticias · ${items.length} items`,
    aviso: file.aviso ?? null,
    fetchedAt: new Date().toISOString(),
    asOf: file.asOf,
    maxAgeHours: maxAge,
  };
}

/**
 * "Noticias sin actualizar desde DD/MM HH:MM" si el asOf (ART) no es de hoy; null si es de hoy.
 * Sin asOf → "Noticias sin actualizar (sin fecha de corrida)".
 */
export function noticiasStaleLabel(asOf: string | null | undefined, now = new Date()): string | null {
  const tz = "America/Argentina/Cordoba";
  if (!asOf || Number.isNaN(Date.parse(asOf))) return "Noticias sin actualizar (sin fecha de corrida)";
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const d = new Date(asOf);
  if (dia(d) === dia(now)) return null;
  return `Noticias sin actualizar desde ${horaArgFromIso(asOf)?.replace(",", "")}`;
}
