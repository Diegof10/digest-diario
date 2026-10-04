import { readFile } from "fs/promises";
import path from "path";
import { dmyToIso, habilesEntre, hoyArtIso, isoToDmy } from "@/lib/habiles";
import { readFiscalBlob, type FiscalBlobFile } from "@/lib/fiscal-cron";
import type {
  FiscalNovedad,
  FiscalSnapshot,
  FiscalVencimiento,
} from "@/lib/types";

/**
 * Fiscal & Estructura AR. Never invent RGs / fechas.
 *
 * Dos capas:
 *  - Blob `fiscal/latest.json` (cron /api/cron/fiscal, lun–vie 08:00 ART): normas del BO
 *    detectadas automáticamente (RG ARCA, decretos, resoluciones agro/fiscal) + fecha de revisión.
 *  - Repo src/data/fiscal-snapshot.json (curado a mano): vencimientos, normas vigentes, pie.
 * getFiscal() mergea ambas (lo curado gana ante la misma norma) y usa la revisión más nueva.
 *
 * Fuentes:
 * - ARCA SISA Info Productiva:
 *   https://www.arca.gob.ar/actividadesAgropecuarias/sector-agro/sisa/informacion-productiva.asp
 * - ARCA vencimientos: https://www.afip.gob.ar/vencimientos/
 * - ARCA anticipos Ganancias PH:
 *   https://arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/declaracion-jurada/determinativa/anticipos.asp
 * - BO: https://www.boletinoficial.gob.ar/
 * - CPCECABA calendario: https://www.consejo.org.ar/calendar_vencimientos
 * - CPCE Córdoba: https://web.cpcecba.org.ar/
 *
 * Refresh: automático (BO/ARCA) vía cron; vencimientos curados → src/data/fiscal-snapshot.json → commit.
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

/** "RG ARCA 5.898/2026" / "Resolución General 5898/2026" → "rg 5898/2026" (para dedupe). */
function claveNorma(n: FiscalNovedad): string | null {
  const m = (n.norma ?? n.texto).match(/(RG|Resoluci[oó]n General|Decreto|Resoluci[oó]n)\D{0,12}?([\d.]+)\/(\d{4})/i);
  if (!m) return null;
  const tipo = /^(RG|Resoluci[oó]n General)/i.test(m[1]) ? "rg" : m[1].toLowerCase().startsWith("d") ? "dec" : "res";
  return `${tipo} ${m[2].replace(/\./g, "")}/${m[3]}`;
}

/** Ítems automáticos del Blob → FiscalNovedad. */
function novedadesAuto(blob: FiscalBlobFile | null): FiscalNovedad[] {
  return (blob?.items ?? [])
    .filter((i) => i && i.url && /^\d{4}-\d{2}-\d{2}$/.test(i.boFecha))
    .map((i) => ({
      texto: `${i.norma} (BO ${isoToDmy(i.boFecha)}): ${i.titulo}`,
      fuente: "BO",
      norma: i.norma,
      boFecha: i.boFecha,
      url: i.url,
      auto: true,
    }));
}

function diaArt(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : hoyArtIso(new Date(iso));
}

async function cargarBlob(): Promise<FiscalBlobFile | null> {
  try {
    return await readFiscalBlob();
  } catch {
    return null;
  }
}

/** `opts.blob` (pruebas): usar ese archivo en vez de leer Blob. */
export async function getFiscal(opts: { blob?: FiscalBlobFile | null } = {}): Promise<FiscalSnapshot> {
  const fetchedAt = new Date().toISOString();
  const blobP = opts.blob !== undefined ? Promise.resolve(opts.blob) : cargarBlob();
  let data: FiscalFile = {};
  try {
    data = JSON.parse(await readFile(snapshotPath(), "utf8")) as FiscalFile;
  } catch {
    data = {};
  }
  const blob = await blobP;
  const hoy = hoyArtIso();

  // Revisión: la más nueva entre la carga manual del snapshot y la última revisión OK del cron.
  const cargaManual =
    (typeof data.actualizadoAt === "string" && data.actualizadoAt.trim()) ||
    (typeof data.fecha === "string" && data.fecha.trim()) ||
    null;
  const revCron = blob?.revisadoAt ?? null;
  const tsRev = (s: string | null) => (s ? Date.parse(s.length === 10 ? `${s}T12:00:00-03:00` : s) || 0 : 0);
  const revisadoPor: "cron" | "manual" | null =
    revCron && tsRev(revCron) >= tsRev(cargaManual) ? "cron" : cargaManual ? "manual" : null;
  const revisadoAt = revisadoPor === "cron" ? revCron : cargaManual;
  const revisadoDia = revisadoAt ? diaArt(revisadoAt) : null;
  const habilesSinRevisar = revisadoDia ? habilesEntre(revisadoDia, hoy) : null;

  // Merge de normas: curadas (snapshot) primero; las automáticas sólo si no repiten norma/URL.
  const curadas = asList<FiscalNovedad>(data.novedades)
    .filter((n) => n && typeof n.texto === "string" && n.texto.trim())
    .map((n) => ({ ...n, boFecha: boFechaDe(n) }));
  const vistas = new Set<string>();
  for (const n of curadas) {
    if (n.url) vistas.add(n.url);
    const k = claveNorma(n);
    if (k) vistas.add(k);
  }
  const auto = novedadesAuto(blob).filter((n) => {
    const k = claveNorma(n);
    if ((n.url && vistas.has(n.url)) || (k && vistas.has(k))) return false;
    if (n.url) vistas.add(n.url);
    if (k) vistas.add(k);
    return true;
  });
  const todas = [...curadas, ...auto].sort((a, b) => (b.boFecha ?? "").localeCompare(a.boFecha ?? ""));

  const desde = isoMenosDias(hoy, NOVEDAD_DIAS);
  // Novedad = sólo BO dentro de los últimos 7 días; el resto pasa a "Normas vigentes".
  const novedades = todas.filter((n) => n.boFecha != null && n.boFecha >= desde && n.boFecha <= hoy);
  const normasVigentes = todas.filter((n) => !novedades.includes(n));

  const fechaSnap = typeof data.fecha === "string" && data.fecha.trim() ? data.fecha.trim() : null;
  const fecha = [fechaSnap, revCron ? diaArt(revCron) : null].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const anio = (fechaSnap ?? hoy).slice(0, 4);
  const todos = asList<FiscalVencimiento>(data.vencimientos).filter(
    (v) => v && typeof v.concepto === "string" && v.concepto.trim(),
  );
  // Filtra vencimientos cuya fecha fin ya pasó (ART).
  const vencimientos = todos
    .map((v) => ({ ...v, vence: venceDe(v, anio) }))
    .filter((v) => !v.vence || v.vence >= hoy);
  const vencidosOcultos = todos.length - vencimientos.length;

  const corrida = blob?.ultimaCorrida ?? null;
  const sisaCambioAt =
    blob?.sisa?.cambioAt && diaArt(blob.sisa.cambioAt) >= desde ? blob.sisa.cambioAt : null;
  const meta = {
    fetchedAt,
    hoy,
    cargaManual,
    revisadoAt,
    revisadoPor,
    habilesSinRevisar,
    cronAt: corrida?.at ?? null,
    cronOk: corrida ? corrida.ok : null,
    cronErrores: corrida?.errores ?? [],
    sisaCambioAt,
  };

  if (todas.length === 0 && vencimientos.length === 0) {
    return { ...EMPTY, ...meta, ok: Boolean(revisadoAt), normasVigentes: [] };
  }

  const novedad = novedades.map((n) => n.texto).join(" · ") || "Sin novedad fiscal";

  return {
    ok: true,
    novedad,
    fuente: typeof data.fuente === "string" && data.fuente.trim() ? data.fuente.trim() : "ARCA · BO",
    fecha,
    actualizadoAt:
      typeof data.actualizadoAt === "string" && data.actualizadoAt.trim() ? data.actualizadoAt.trim() : null,
    novedades,
    vencimientos,
    lineaTablero: novedad,
    pie: typeof data.pie === "string" && data.pie.trim() ? data.pie.trim() : null,
    ultimaRevision: revisadoDia,
    vencidosOcultos,
    normasVigentes,
    ...meta,
  };
}
