import { fechaEsperada, frescura, habilAnterior, hoyArtIso, isoToDmy, REGLAS, type Frescura } from "@/lib/habiles";
import { mergeSerie, readSerie, valorEnSerie } from "@/lib/serie-blob";

/**
 * Futuros Matba Rofex (A3 Mercados) — precios de AJUSTE oficiales.
 *
 * Fuente: API pública de cierres de A3 (la misma que usa matbarofex.com.ar →
 * "Precios de cierre"), sin usuario ni API key:
 *   https://apicem.matbarofex.com.ar/api/v2/closing-prices?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Cada fila trae symbol (p. ej. SOJ.ROS/MAY27), settlement (ajuste) y dateTime (rueda).
 *
 * Reglas:
 *  - Sólo futuros en dólares de Rosario (SOJ/MAI/TRI.ROS/<MES><AA>), nunca el
 *    "disponible" (DIS), opciones ni minis.
 *  - asOf = fecha de la rueda del ajuste (no la hora de lectura).
 *  - Si A3 no responde, se usa el último ajuste guardado en Blob con SU fecha y
 *    queda marcado viejo/vencido; nunca se repite un número con fecha nueva.
 */

export const A3_CLOSING_URL = "https://apicem.matbarofex.com.ar/api/v2/closing-prices";
export const A3_FUENTE_URL = "https://www.matbarofex.com.ar/";
export const MATBA_FUENTE = "A3 Matba Rofex · ajuste";

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.1; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;
type Mes = (typeof MESES)[number];
const MES_LABEL: Record<Mes, string> = {
  ENE: "Ene", FEB: "Feb", MAR: "Mar", ABR: "Abr", MAY: "May", JUN: "Jun",
  JUL: "Jul", AGO: "Ago", SEP: "Sep", OCT: "Oct", NOV: "Nov", DIC: "Dic",
};

export type GranoMatba = "soja" | "maiz" | "trigo";
const PREFIJO: Record<GranoMatba, string> = { soja: "SOJ", maiz: "MAI", trigo: "TRI" };
const LABEL: Record<GranoMatba, string> = { soja: "Soja Rosario", maiz: "Maíz Rosario", trigo: "Trigo Rosario" };

/**
 * Posiciones que se publican: el próximo contrato vivo de cada mes.
 * soja Nov (cosecha vieja) y May (cosecha nueva) · maíz Dic y Abr (cosecha) · trigo Dic y Ene (cosecha).
 */
export const POSICIONES: Array<{ grano: GranoMatba; mes: Mes }> = [
  { grano: "soja", mes: "NOV" },
  { grano: "soja", mes: "MAY" },
  { grano: "maiz", mes: "DIC" },
  { grano: "maiz", mes: "ABR" },
  { grano: "trigo", mes: "DIC" },
  { grano: "trigo", mes: "ENE" },
];

export interface MatbaContrato {
  /** "soja-MAY27" (compatible con el feed anterior) */
  id: string;
  label: string;
  grano: GranoMatba;
  mes: Mes;
  /** "May-27" */
  contract: string;
  /** "SOJ.ROS/MAY27" */
  symbol: string;
  /** Ajuste US$/t */
  value: number;
  /** Variación decimal vs ajuste anterior (−0.01 = −1 %) */
  change: number | null;
  previous: number | null;
  volume: number | null;
  openInterest: number | null;
  /** Fecha de la rueda del ajuste (YYYY-MM-DD, ART) */
  asOf: string;
  tipo: "futuro";
  unit: "US$/t";
  fuente: string;
  frescura: Frescura;
  /** true si no es el último ajuste esperado (viejo o vencido) */
  stale: boolean;
}

export interface MatbaSnapshot {
  ok: boolean;
  /** Fecha de rueda de los ajustes mostrados (null si no hay ninguno) */
  asOf: string | null;
  /** Rueda cuyo ajuste ya debería estar publicado */
  esperado: string;
  frescura: Frescura | null;
  stale: boolean;
  /** "a3" = leído ahora · "blob" = último guardado (A3 no respondió) · "none" */
  origen: "a3" | "blob" | "none";
  fuente: string;
  fuenteUrl: string;
  error: string | null;
  contratos: MatbaContrato[];
  fetchedAt: string;
}

type A3Row = {
  dateTime: string;
  symbol: string;
  settlement: number | null;
  previousClose?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  openInterest?: number | null;
  product?: string | null;
};

const SYMBOL_RE = /^(SOJ|MAI|TRI)\.ROS\/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)(\d{2})$/;

function contratoKey(symbol: string): { pref: string; mes: Mes; yy: number } | null {
  const m = symbol.match(SYMBOL_RE);
  if (!m) return null;
  return { pref: m[1], mes: m[2] as Mes, yy: Number(m[3]) };
}

async function fetchA3Dia(fecha: string, fresh: boolean): Promise<A3Row[]> {
  const url = `${A3_CLOSING_URL}?from=${fecha}&to=${fecha}&page=1&pageSize=1000`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 900 } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`A3 HTTP ${res.status}`);
  const j = (await res.json()) as { data?: A3Row[] };
  return Array.isArray(j.data) ? j.data : [];
}

/** Elige, por posición, el contrato vivo más cercano (menor año) presente en la rueda. */
function elegir(rows: A3Row[], asOf: string): MatbaContrato[] {
  const out: MatbaContrato[] = [];
  for (const p of POSICIONES) {
    const cands = rows
      .filter((r) => !/disponible|min/i.test(r.product ?? ""))
      .map((r) => ({ r, k: contratoKey(r.symbol) }))
      .filter((x) => x.k && x.k.pref === PREFIJO[p.grano] && x.k.mes === p.mes)
      .filter((x) => x.r.settlement != null && Number.isFinite(x.r.settlement) && x.r.settlement > 0)
      .sort((a, b) => a.k!.yy - b.k!.yy);
    const c = cands[0];
    if (!c) continue;
    const yy = String(c.k!.yy).padStart(2, "0");
    const prev = c.r.previousClose != null && c.r.previousClose > 0 ? c.r.previousClose : null;
    const change =
      c.r.changePercent != null && Number.isFinite(c.r.changePercent)
        ? Math.round(c.r.changePercent * 100) / 10000
        : prev
          ? c.r.settlement! / prev - 1
          : null;
    out.push({
      id: `${p.grano}-${p.mes}${yy}`,
      label: LABEL[p.grano],
      grano: p.grano,
      mes: p.mes,
      contract: `${MES_LABEL[p.mes]}-${yy}`,
      symbol: c.r.symbol,
      value: c.r.settlement!,
      change,
      previous: prev,
      volume: c.r.volume ?? null,
      openInterest: c.r.openInterest ?? null,
      asOf,
      tipo: "futuro",
      unit: "US$/t",
      fuente: MATBA_FUENTE,
      frescura: "fresco",
      stale: false,
    });
  }
  return out;
}

function conFrescura(cs: MatbaContrato[], now: Date): MatbaContrato[] {
  return cs.map((c) => {
    const f = frescura(c.asOf, REGLAS.matba, now);
    return { ...c, frescura: f, stale: f !== "fresco" };
  });
}

let ultimoGuardado: string | null = null;

async function guardar(cs: MatbaContrato[]): Promise<void> {
  if (cs.length === 0 || ultimoGuardado === cs[0].asOf) return;
  const r = await mergeSerie(cs.map((c) => ({ serie: "matba.usd", grano: c.symbol, fecha: c.asOf, valor: c.value })));
  if (!r.error) ultimoGuardado = cs[0].asOf;
}

/** Último ajuste guardado (por posición), con su fecha real. */
async function desdeBlob(): Promise<MatbaContrato[]> {
  const file = await readSerie();
  const serie = file.series["matba.usd"];
  if (!serie) return [];
  const out: MatbaContrato[] = [];
  for (const p of POSICIONES) {
    const cands = Object.keys(serie)
      .map((symbol) => ({ symbol, k: contratoKey(symbol) }))
      .filter((x) => x.k && x.k.pref === PREFIJO[p.grano] && x.k.mes === p.mes)
      .map((x) => {
        const fechas = Object.keys(serie[x.symbol]).sort();
        return { ...x, fecha: fechas[fechas.length - 1] };
      })
      .filter((x) => x.fecha)
      // la rueda más nueva; a igual fecha, el contrato más cercano
      .sort((a, b) => (a.fecha === b.fecha ? a.k!.yy - b.k!.yy : a.fecha < b.fecha ? 1 : -1));
    const c = cands[0];
    if (!c) continue;
    const v = valorEnSerie(file, "matba.usd", c.symbol, c.fecha);
    if (v == null) continue;
    const yy = String(c.k!.yy).padStart(2, "0");
    out.push({
      id: `${p.grano}-${p.mes}${yy}`,
      label: LABEL[p.grano],
      grano: p.grano,
      mes: p.mes,
      contract: `${MES_LABEL[p.mes]}-${yy}`,
      symbol: c.symbol,
      value: v,
      change: null,
      previous: null,
      volume: null,
      openInterest: null,
      asOf: c.fecha,
      tipo: "futuro",
      unit: "US$/t",
      fuente: `${MATBA_FUENTE} (guardado)`,
      frescura: "fresco",
      stale: false,
    });
  }
  return out;
}

/**
 * Último ajuste publicado: arranca en hoy (ART) y retrocede hábiles hasta
 * encontrar una rueda con datos (máx. 6 consultas).
 */
export async function getMatba(opts: { fresh?: boolean; now?: Date } = {}): Promise<MatbaSnapshot> {
  const now = opts.now ?? new Date();
  const fetchedAt = now.toISOString();
  let contratos: MatbaContrato[] = [];
  let origen: MatbaSnapshot["origen"] = "none";
  let error: string | null = null;

  try {
    let fecha = hoyArtIso(now);
    const wd = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) fecha = habilAnterior(fecha);
    for (let i = 0; i < 6; i++) {
      const rows = await fetchA3Dia(fecha, Boolean(opts.fresh));
      const elegidos = elegir(rows, fecha);
      if (elegidos.length > 0) {
        contratos = elegidos;
        origen = "a3";
        break;
      }
      fecha = habilAnterior(fecha);
    }
    if (origen === "none") error = "A3 sin ajustes en los últimos 6 hábiles";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (origen === "a3") {
    await guardar(contratos).catch(() => undefined);
  } else {
    const viejos = await desdeBlob().catch(() => []);
    if (viejos.length > 0) {
      contratos = viejos;
      origen = "blob";
    }
  }

  contratos = conFrescura(contratos, now);
  const asOf = contratos.length ? contratos.map((c) => c.asOf).sort().reverse()[0] : null;
  const f = asOf ? frescura(asOf, REGLAS.matba, now) : null;
  return {
    ok: contratos.length > 0 && f !== "vencido",
    asOf,
    esperado: fechaEsperadaMatba(now),
    frescura: f,
    stale: f !== "fresco",
    origen,
    fuente: MATBA_FUENTE,
    fuenteUrl: A3_FUENTE_URL,
    error,
    contratos,
    fetchedAt,
  };
}

export function fechaEsperadaMatba(now = new Date()): string {
  return fechaEsperada(REGLAS.matba, now);
}

/** "ajuste 07/10/2026" (+ marca si es viejo). */
export function matbaFechaLabel(c: Pick<MatbaContrato, "asOf" | "frescura">): string {
  return `ajuste ${isoToDmy(c.asOf)}${c.frescura === "viejo" ? " · dato viejo" : ""}`;
}
