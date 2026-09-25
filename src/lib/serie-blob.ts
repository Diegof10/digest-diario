import { get, put } from "@vercel/blob";

/**
 * Serie histórica de cierres publicados por plaza, persistida en Vercel Blob
 * (store conectado al proyecto; auth OIDC vía BLOB_STORE_ID, o BLOB_READ_WRITE_TOKEN).
 *
 * Estructura: { [serieId]: { [grano]: { [yyyy-mm-dd]: número } } }
 *  - afa.ars, cac.ars, cac.usd, fob.usd, fx.bna (grano "usd")
 * Sólo se guardan valores publicados por la fuente; nunca se rellenan huecos.
 */

export type Serie = Record<string, Record<string, Record<string, number>>>;

export interface SerieFile {
  updatedAt: string | null;
  series: Serie;
}

const PATHNAME = "series/plazas.json";
type Access = "private" | "public";

let accessOk: Access | null = null;
let memo: { at: number; file: SerieFile } | null = null;
let lastError: string | null = null;

export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN)),
  );
}

export function blobLastError(): string | null {
  return lastError;
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

export async function readSerie(force = false): Promise<SerieFile> {
  const empty: SerieFile = { updatedAt: null, series: {} };
  if (!blobConfigured()) return empty;
  if (!force && memo && Date.now() - memo.at < 60_000) return memo.file;
  const order: Access[] = accessOk ? [accessOk] : ["private", "public"];
  for (const access of order) {
    try {
      const res = await get(PATHNAME, { access, useCache: false });
      accessOk = access;
      if (!res || res.statusCode !== 200) {
        memo = { at: Date.now(), file: empty };
        return empty;
      }
      const parsed = JSON.parse(await streamToText(res.stream)) as SerieFile;
      const file: SerieFile = {
        updatedAt: parsed.updatedAt ?? null,
        series: parsed.series ?? {},
      };
      memo = { at: Date.now(), file };
      lastError = null;
      return file;
    } catch (err) {
      lastError = `read(${access}): ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return empty;
}

/** Mergea puntos nuevos; escribe sólo si hubo cambios. Devuelve true si escribió. */
export async function mergeSerie(
  puntos: Array<{ serie: string; grano: string; fecha: string; valor: number }>,
): Promise<{ written: boolean; error: string | null }> {
  if (!blobConfigured()) return { written: false, error: "blob no configurado" };
  const valid = puntos.filter(
    (p) => Number.isFinite(p.valor) && p.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha),
  );
  if (valid.length === 0) return { written: false, error: null };
  const file = await readSerie(true);
  let changed = false;
  for (const p of valid) {
    const s = (file.series[p.serie] ??= {});
    const g = (s[p.grano] ??= {});
    if (g[p.fecha] !== p.valor) {
      g[p.fecha] = p.valor;
      changed = true;
    }
  }
  if (!changed) return { written: false, error: null };
  file.updatedAt = new Date().toISOString();
  const body = JSON.stringify(file);
  const order: Access[] = accessOk ? [accessOk] : ["private", "public"];
  for (const access of order) {
    try {
      await put(PATHNAME, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      accessOk = access;
      memo = { at: Date.now(), file };
      lastError = null;
      return { written: true, error: null };
    } catch (err) {
      lastError = `write(${access}): ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { written: false, error: lastError };
}

/** Último valor con fecha < `antesDe` en la serie. */
export function previoEnSerie(
  file: SerieFile,
  serie: string,
  grano: string,
  antesDe: string,
): { fecha: string; valor: number } | null {
  const g = file.series[serie]?.[grano];
  if (!g) return null;
  const fechas = Object.keys(g)
    .filter((f) => f < antesDe)
    .sort();
  const f = fechas[fechas.length - 1];
  return f ? { fecha: f, valor: g[f] } : null;
}

export function valorEnSerie(
  file: SerieFile,
  serie: string,
  grano: string,
  fecha: string,
): number | null {
  const v = file.series[serie]?.[grano]?.[fecha];
  return v != null && Number.isFinite(v) ? v : null;
}
