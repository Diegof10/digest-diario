/**
 * Cierre CBOT (soja, maíz, trigo) con fecha de sesión explícita.
 * Fuente: velas diarias de Yahoo Finance (el sitio de CME bloquea el fetch automático).
 * El precio de Yahoo viene en centavos de dólar por bushel; se pasa a US$/t con el
 * factor físico del bushel. Se muestra el último cierre ya liquidado (13:20 CT),
 * no la vela del día si la sesión sigue abierta.
 */

export const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/** USc/bu → US$/t. Soja y trigo: 60 lb/bu. Maíz: 56 lb/bu. */
export const FACTOR_USD_T = {
  soja: 0.367437,
  maiz: 0.393682,
  trigo: 0.367437,
} as const;

export type GranoCbot = keyof typeof FACTOR_USD_T;

export const CBOT_TICKERS: Record<GranoCbot, string> = {
  soja: "ZS=F",
  maiz: "ZC=F",
  trigo: "ZW=F",
};

/** Liquidación de granos CBOT ~13:20 hora de Chicago. Antes de eso, el cierre es el de ayer. */
export const HORA_CIERRE_CHICAGO = "13:20";

export interface BarraDiaria {
  /** Unix segundos (Yahoo marca la vela a la medianoche ET del día de sesión). */
  ts: number;
  /** Cierre en la unidad de Yahoo (USc/bu en estos contratos). */
  close: number;
}

export interface CierreCbot {
  /** USc/bu del cierre elegido */
  centavos: number;
  prevCentavos: number | null;
  /** yyyy-mm-dd de la sesión (America/New_York, como fecha Yahoo). */
  fecha: string;
  prevFecha: string | null;
  /** true si se descartó la vela de hoy porque la sesión no liquidó */
  enCursoDescartada: boolean;
}

export function fechaSesionNy(tsSec: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsSec * 1000));
}

export function hhmmEn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h.replace(/^24$/, "00")}:${m}`;
}

/**
 * Elige el cierre ya ocurrido. Si la última vela es la sesión de hoy en Nueva York
 * y en Chicago todavía no son las 13:20, usa la vela anterior.
 */
export function elegirCierre(barras: BarraDiaria[], now = new Date()): CierreCbot | null {
  const ordered = barras
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.ts - b.ts);
  if (ordered.length === 0) return null;
  const last = ordered[ordered.length - 1];
  const hoyNy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const sesionLast = fechaSesionNy(last.ts);
  const enCurso = sesionLast >= hoyNy && hhmmEn("America/Chicago", now) < HORA_CIERRE_CHICAGO;
  const idx = enCurso && ordered.length >= 2 ? ordered.length - 2 : ordered.length - 1;
  const cierre = ordered[idx];
  const prev = idx > 0 ? ordered[idx - 1] : null;
  return {
    centavos: cierre.close,
    prevCentavos: prev?.close ?? null,
    fecha: fechaSesionNy(cierre.ts),
    prevFecha: prev ? fechaSesionNy(prev.ts) : null,
    enCursoDescartada: enCurso && ordered.length >= 2,
  };
}

export function aUsdTon(grano: GranoCbot, centavos: number): number {
  return Math.round(centavos * FACTOR_USD_T[grano] * 10) / 10;
}

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

export function barrasDeYahoo(data: YahooChart): BarraDiaria[] {
  const result = data.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const out: BarraDiaria[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close != null && Number.isFinite(close)) out.push({ ts: ts[i], close });
  }
  return out;
}

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchCierre(
  grano: GranoCbot,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<CierreCbot | null> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${YAHOO_CHART}/${CBOT_TICKERS[grano]}?interval=1d&range=10d`;
  const res = await f(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Yahoo ${CBOT_TICKERS[grano]} HTTP ${res.status}`);
  return elegirCierre(barrasDeYahoo((await res.json()) as YahooChart), opts.now ?? new Date());
}

export async function fetchCierresCbot(
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<Record<GranoCbot, CierreCbot | null>> {
  const granos = Object.keys(CBOT_TICKERS) as GranoCbot[];
  const pairs = await Promise.all(
    granos.map(async (g) => {
      try {
        return [g, await fetchCierre(g, opts)] as const;
      } catch {
        return [g, null] as const;
      }
    }),
  );
  return Object.fromEntries(pairs) as Record<GranoCbot, CierreCbot | null>;
}
