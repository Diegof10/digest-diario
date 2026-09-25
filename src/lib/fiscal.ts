import { readFile } from "fs/promises";
import path from "path";
import { dmyToIso, hoyArtIso } from "@/lib/habiles";
import { readCronLog } from "@/lib/serie-blob";
import type {
  FiscalNovedad,
  FiscalSnapshot,
  FiscalVencimiento,
} from "@/lib/types";

/**
 * Fiscal & Estructura AR — dated snapshot only. Never invent RGs / fechas.
 *
 * Fuentes (documentar; no scrape en runtime):
 * - ARCA SISA Info Productiva:
 *   https://www.arca.gob.ar/actividadesAgropecuarias/sector-agro/sisa/informacion-productiva.asp
 * - ARCA vencimientos: https://www.afip.gob.ar/vencimientos/
 * - ARCA anticipos Ganancias PH:
 *   https://arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/declaracion-jurada/determinativa/anticipos.asp
 * - BO: https://www.boletinoficial.gob.ar/
 * - CPCECABA calendario: https://www.consejo.org.ar/calendar_vencimientos
 * - CPCE Córdoba: https://web.cpcecba.org.ar/
 *
 * Refresh: Fiscal agent → src/data/fiscal-snapshot.json → commit.
 */

const SNAPSHOT_REL = path.join("src", "data", "fiscal-snapshot.json");

const EMPTY: FiscalSnapshot = {
  ok: false,
  novedad: "sin novedad fiscal",
  fuente: null,
  fetchedAt: new Date().toISOString(),
  fecha: null,
  actualizadoAt: null,
  novedades: [],
  vencimientos: [],
  lineaTablero: "sin novedad fiscal",
  pie: null,
};

interface FiscalFile {
  fecha?: string | null;
  actualizadoAt?: string | null;
  fuente?: string | null;
  novedades?: FiscalNovedad[] | null;
  vencimientos?: FiscalVencimiento[] | null;
  lineaTablero?: string | null;
  /** alias opcional de lineaTablero */
  novedad?: string | null;
  pie?: string | null;
}

function snapshotPath(): string {
  return path.join(process.cwd(), SNAPSHOT_REL);
}

/** Fecha fin de un vencimiento: campo `vence` o la mayor fecha dd/mm(/yyyy) de la ventana. */
export function venceDe(v: FiscalVencimiento, anioDefault: string): string | null {
  if (v.vence && /^\d{4}-\d{2}-\d{2}$/.test(v.vence)) return v.vence;
  const fechas: string[] = [];
  const re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v.ventana)) !== null) {
    const y = m[3] ?? anioDefault;
    fechas.push(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  return fechas.sort().pop() ?? null;
}

function asList<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Días de ventana para "Novedad": publicación en BO dentro de los últimos 7 días (ART). */
export const NOVEDAD_DIAS = 7;

function isoMenosDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

/** Fecha BO: campo boFecha o "(BO dd/mm/aaaa)" en el texto. */
function boFechaDe(n: FiscalNovedad): string | null {
  if (n.boFecha && /^\d{4}-\d{2}-\d{2}$/.test(n.boFecha)) return n.boFecha;
  return dmyToIso(n.texto.match(/BO\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]);
}

async function ultimaCorridaCron(): Promise<string | null> {
  try {
    const runs = await readCronLog();
    const ats = runs.map((r) => r?.at).filter((a): a is string => typeof a === "string" && !Number.isNaN(Date.parse(a)));
    return ats.sort().pop() ?? null;
  } catch {
    return null;
  }
}

export async function getFiscal(): Promise<FiscalSnapshot> {
  const fetchedAt = new Date().toISOString();
  const cronAtP = ultimaCorridaCron();
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const data = JSON.parse(raw) as FiscalFile;
    const todas = asList<FiscalNovedad>(data.novedades)
      .filter((n) => n && typeof n.texto === "string" && n.texto.trim())
      .map((n) => ({ ...n, boFecha: boFechaDe(n) }));
    const hoy = hoyArtIso();
    const desde = isoMenosDias(hoy, NOVEDAD_DIAS);
    // Novedad = sólo BO dentro de los últimos 7 días; el resto pasa a "Normas vigentes".
    const novedades = todas.filter((n) => n.boFecha != null && n.boFecha >= desde && n.boFecha <= hoy);
    const normasVigentes = todas.filter((n) => !novedades.includes(n));
    const cronAt = await cronAtP;
    const cargaManual =
      (typeof data.actualizadoAt === "string" && data.actualizadoAt.trim()) ||
      (typeof data.fecha === "string" && data.fecha.trim()) ||
      null;
    const anio = (typeof data.fecha === "string" && data.fecha.slice(0, 4)) || hoy.slice(0, 4);
    const todos = asList<FiscalVencimiento>(data.vencimientos).filter(
      (v) => v && typeof v.concepto === "string" && v.concepto.trim(),
    );
    // Filtra vencimientos cuya fecha fin ya pasó (ART).
    const vencimientos = todos
      .map((v) => ({ ...v, vence: venceDe(v, anio) }))
      .filter((v) => !v.vence || v.vence >= hoy);
    const vencidosOcultos = todos.length - vencimientos.length;
    if (todas.length === 0 && vencimientos.length === 0) {
      return { ...EMPTY, fetchedAt, hoy, cronAt, cargaManual, normasVigentes: [] };
    }

    // La línea libre del snapshot (lineaTablero) mezclaba normas viejas como "novedad":
    // ahora la novedad sale sólo de los ítems con BO en los últimos 7 días.
    const novedad = novedades.map((n) => n.texto).join(" · ") || "Sin novedad fiscal";

    return {
      ok: true,
      novedad,
      fuente:
        typeof data.fuente === "string" && data.fuente.trim()
          ? data.fuente.trim()
          : "Fiscal & Estructura AR · BO/ARCA/CPCE",
      fetchedAt,
      fecha:
        typeof data.fecha === "string" && data.fecha.trim()
          ? data.fecha.trim()
          : null,
      actualizadoAt:
        typeof data.actualizadoAt === "string" && data.actualizadoAt.trim()
          ? data.actualizadoAt.trim()
          : null,
      novedades,
      vencimientos,
      lineaTablero: novedad,
      pie:
        typeof data.pie === "string" && data.pie.trim()
          ? data.pie.trim()
          : null,
      ultimaRevision:
        typeof data.fecha === "string" && data.fecha.trim()
          ? data.fecha.trim()
          : null,
      hoy,
      vencidosOcultos,
      normasVigentes,
      cronAt,
      cargaManual,
    };
  } catch {
    return { ...EMPTY, fetchedAt, hoy: hoyArtIso(), cronAt: await cronAtP, cargaManual: null, normasVigentes: [] };
  }
}
