/**
 * FOB oficial y FAS teórico de la Secretaría de Agricultura (MAGyP).
 * Página pública, sin clave:
 *   https://www.magyp.gob.ar/mercadosagropecuarios/precios.php
 * Reemplaza el FAS del feed externo, que quedó clavado al 02/09/2026.
 * FOB en USD/t (primer embarque) y FAS en ARS/t. Sorgo incluido.
 */

import { dmyToIso, marcaAntiguedad, UMBRAL_FAS_DIAS, type MarcaAntiguedad } from "@/lib/habiles";

export const MAGYP_PRECIOS_URL = "https://www.magyp.gob.ar/mercadosagropecuarios/precios.php";
export const FUENTE_MAGYP = "MAGyP · FOB oficial y FAS teórico";

export type GranoOficial = "soja" | "maiz" | "trigo" | "girasol" | "sorgo";

export interface FobFasItem {
  grano: GranoOficial;
  /** USD/t, primer embarque */
  fobUsd: number | null;
  /** ARS/t, FAS teórico */
  fasArs: number | null;
}

export interface FobFasSnapshot {
  fecha: string | null;
  fuente: string;
  url: string;
  items: FobFasItem[];
  antiguedad: MarcaAntiguedad;
  error: string | null;
  fetchedAt: string;
}

const GRANOS: Array<{ grano: GranoOficial; alt: string }> = [
  { grano: "trigo", alt: "trigo" },
  { grano: "maiz", alt: "maiz" },
  { grano: "girasol", alt: "girasol" },
  { grano: "soja", alt: "soja" },
  { grano: "sorgo", alt: "sorgo" },
];

/** "563.761" (miles con punto) → 563761. "481" → 481. */
export function numMagyp(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,3}(?:\.\d{3})+$/.test(t) && !/^\d+(?:[.,]\d+)?$/.test(t)) return null;
  const n = /^\d{1,3}(?:\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseMagypPrecios(html: string): { fecha: string; items: FobFasItem[] } | null {
  const fm = html.match(/Cotizaciones de granos a:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const fecha = dmyToIso(fm?.[1]);
  if (!fecha) return null;
  const items: FobFasItem[] = [];
  for (const g of GRANOS) {
    const re = new RegExp(
      `alt="${g.alt}"[\\s\\S]{0,700}?FOB:\\s*([0-9.]+)\\s*USD/t[\\s\\S]{0,240}?([0-9.]+)\\s*\\$/t`,
      "i",
    );
    const m = html.match(re);
    const fob = m ? numMagyp(m[1]) : null;
    const fas = m ? numMagyp(m[2]) : null;
    if (fob == null && fas == null) continue;
    // El FAS teórico de granos está en cientos de miles de pesos; un FOB repetido no cuenta como FAS.
    const fasArs = fas != null && fas >= 10_000 ? fas : null;
    items.push({ grano: g.grano, fobUsd: fob, fasArs });
  }
  if (items.length === 0) return null;
  return { fecha, items };
}

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function getFobFas(
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<FobFasSnapshot> {
  const now = opts.now ?? new Date();
  const base = {
    fuente: FUENTE_MAGYP,
    url: MAGYP_PRECIOS_URL,
    fetchedAt: now.toISOString(),
  };
  try {
    const f = opts.fetchImpl ?? fetch;
    const res = await f(MAGYP_PRECIOS_URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseMagypPrecios(await res.text());
    if (!parsed) throw new Error("sin precios parseables");
    return {
      ...base,
      fecha: parsed.fecha,
      items: parsed.items,
      antiguedad: marcaAntiguedad(parsed.fecha, UMBRAL_FAS_DIAS),
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      fecha: null,
      items: [],
      antiguedad: "desactualizado",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
