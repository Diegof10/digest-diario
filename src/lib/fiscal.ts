import { readFile } from "fs/promises";
import path from "path";
import { hoyArtIso } from "@/lib/habiles";
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

export async function getFiscal(): Promise<FiscalSnapshot> {
  const fetchedAt = new Date().toISOString();
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const data = JSON.parse(raw) as FiscalFile;
    const novedades = asList<FiscalNovedad>(data.novedades).filter(
      (n) => n && typeof n.texto === "string" && n.texto.trim(),
    );
    const hoy = hoyArtIso();
    const anio = (typeof data.fecha === "string" && data.fecha.slice(0, 4)) || hoy.slice(0, 4);
    const todos = asList<FiscalVencimiento>(data.vencimientos).filter(
      (v) => v && typeof v.concepto === "string" && v.concepto.trim(),
    );
    // Filtra vencimientos cuya fecha fin ya pasó (ART).
    const vencimientos = todos
      .map((v) => ({ ...v, vence: venceDe(v, anio) }))
      .filter((v) => !v.vence || v.vence >= hoy);
    const vencidosOcultos = todos.length - vencimientos.length;
    const linea =
      (typeof data.lineaTablero === "string" && data.lineaTablero.trim()) ||
      (typeof data.novedad === "string" && data.novedad.trim()) ||
      "";

    if (!linea && novedades.length === 0 && vencimientos.length === 0) {
      return { ...EMPTY, fetchedAt, hoy };
    }

    const novedad =
      linea ||
      novedades.map((n) => n.texto).join(" · ") ||
      "sin novedad fiscal";

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
    };
  } catch {
    return { ...EMPTY, fetchedAt, hoy: hoyArtIso() };
  }
}
