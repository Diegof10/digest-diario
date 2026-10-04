import { get, put } from "@vercel/blob";
import { hoyArtIso } from "@/lib/habiles";
import { blobConfigured } from "@/lib/serie-blob";

/**
 * Clima AR/BR/US automático (cron Vercel diario 06:50 ART = "50 9 * * *", ver vercel.json).
 *
 * 1. Pronóstico 7 días por zona productiva (Open-Meteo, salida de modelo, sin clave):
 *    lluvia acumulada, máx/mín promedio y riesgo de helada (mín ≤ 2 °C).
 *      AR zona núcleo · BR soja (MT/GO/MS/PR/RS) · US Corn Belt.
 * 2. US Drought Monitor (API pública usdmdataservices.unl.edu): % de EE.UU. contiguo en
 *    sequía D1–D4 y D3–D4, último mapa vs semana previa.
 * 3. INMET: ¿ya está publicado el boletim agroclimatológico del mes en curso? → aviso.
 *    (SMN está detrás de un challenge de Cloudflare: no se puede consultar desde el server;
 *    el trimestral SMN sigue curado a mano en src/lib/clima.ts.)
 * 4. Resultado → Blob `clima/latest.json`. Si una fuente falla se conserva lo anterior
 *    de esa fuente y se registra el error (nunca se inventa clima).
 */

export const CLIMA_BLOB_PATH = "clima/latest.json";
const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type Pais = "AR" | "BR" | "US";

export const ZONAS: Record<Pais, { zona: string; puntos: Array<{ nombre: string; lat: number; lon: number }> }> = {
  AR: {
    zona: "zona núcleo",
    puntos: [
      { nombre: "Pergamino", lat: -33.89, lon: -60.57 },
      { nombre: "Marcos Juárez", lat: -32.7, lon: -62.1 },
      { nombre: "Rafaela", lat: -31.25, lon: -61.49 },
      { nombre: "Río Cuarto", lat: -33.13, lon: -64.35 },
      { nombre: "9 de Julio", lat: -35.44, lon: -60.88 },
    ],
  },
  BR: {
    zona: "zona sojera",
    puntos: [
      { nombre: "Sorriso (MT)", lat: -12.55, lon: -55.71 },
      { nombre: "Rio Verde (GO)", lat: -17.8, lon: -50.93 },
      { nombre: "Dourados (MS)", lat: -22.22, lon: -54.81 },
      { nombre: "Cascavel (PR)", lat: -24.96, lon: -53.46 },
      { nombre: "Passo Fundo (RS)", lat: -28.26, lon: -52.41 },
    ],
  },
  US: {
    zona: "Corn Belt",
    puntos: [
      { nombre: "Des Moines (IA)", lat: 41.59, lon: -93.62 },
      { nombre: "Champaign (IL)", lat: 40.12, lon: -88.24 },
      { nombre: "Indianapolis (IN)", lat: 39.77, lon: -86.16 },
      { nombre: "Lincoln (NE)", lat: 40.81, lon: -96.7 },
      { nombre: "Mankato (MN)", lat: 44.16, lon: -94.0 },
    ],
  },
};

export interface PronosticoPais {
  zona: string;
  /** yyyy-mm-dd primer y último día del pronóstico (hora local de cada punto) */
  desde: string;
  hasta: string;
  lluviaPromMm: number;
  lluviaMin: { nombre: string; mm: number };
  lluviaMax: { nombre: string; mm: number };
  tmaxProm: number;
  tminProm: number;
  /** puntos con mínima ≤ 2 °C en algún día */
  helada: Array<{ nombre: string; tmin: number; fecha: string }>;
  texto: string;
  at: string;
}

export interface UsdmStat {
  /** yyyy-mm-dd (martes de validez del mapa) */
  mapDate: string;
  d1d4: number;
  d3d4: number;
  prevMapDate: string | null;
  deltaD1d4: number | null;
  texto: string;
  at: string;
}

export interface InmetBoletin {
  /** "outubro/2026" */
  mes: string;
  url: string;
  publicado: boolean;
  checkedAt: string;
}

export interface ClimaBlobFile {
  /** Última corrida con pronóstico OK (ISO). Es la fecha que muestra el panel. */
  actualizadoAt: string | null;
  pronostico: Partial<Record<Pais, PronosticoPais>>;
  usdm: UsdmStat | null;
  inmet: InmetBoletin | null;
  ultimaCorrida: { at: string; ok: boolean; ms: number; errores: string[] } | null;
}

type Fetch = typeof fetch;

async function conTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;

/* ------------------------------ Open-Meteo ------------------------------ */

type OmDaily = {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
  };
};

export function resumirPronostico(pais: Pais, data: OmDaily[], at: string): PronosticoPais {
  const { zona, puntos } = ZONAS[pais];
  const filas = puntos.map((p, i) => {
    const d = data[i]?.daily;
    const time = d?.time ?? [];
    const pr = (d?.precipitation_sum ?? []).filter((x): x is number => typeof x === "number");
    const tx = (d?.temperature_2m_max ?? []).filter((x): x is number => typeof x === "number");
    const tn = d?.temperature_2m_min ?? [];
    if (time.length < 5 || pr.length < 5 || tx.length < 5) throw new Error(`Open-Meteo ${pais} ${p.nombre}: respuesta incompleta`);
    let minT = Infinity;
    let minF = time[0];
    tn.forEach((v, k) => {
      if (typeof v === "number" && v < minT) {
        minT = v;
        minF = time[k];
      }
    });
    return { nombre: p.nombre, mm: pr.reduce((a, b) => a + b, 0), tmax: avg(tx), tmin: minT, tminProm: avg(tn.filter((x): x is number => typeof x === "number")), tminFecha: minF, desde: time[0], hasta: time[time.length - 1] };
  });
  const porLluvia = [...filas].sort((a, b) => a.mm - b.mm);
  const lluviaProm = avg(filas.map((f) => f.mm));
  const tmaxProm = avg(filas.map((f) => f.tmax));
  const tminProm = avg(filas.map((f) => f.tminProm));
  const helada = filas.filter((f) => f.tmin <= 2).map((f) => ({ nombre: f.nombre, tmin: round1(f.tmin), fecha: f.tminFecha }));
  const desde = filas[0].desde;
  const hasta = filas[0].hasta;
  const lo = porLluvia[0];
  const hi = porLluvia[porLluvia.length - 1];
  let texto =
    `Próx. 7 días (${ddmm(desde)}–${ddmm(hasta)}), ${zona}: lluvia prom. ${nf0.format(lluviaProm)} mm ` +
    `(${lo.nombre} ${nf0.format(lo.mm)} – ${hi.nombre} ${nf0.format(hi.mm)} mm); ` +
    `máx. prom. ${nf0.format(tmaxProm)} °C, mín. prom. ${nf0.format(tminProm)} °C.`;
  if (helada.length) {
    texto += ` Riesgo de helada: ${helada.map((h) => `${h.nombre} ${nf1.format(h.tmin)} °C (${ddmm(h.fecha)})`).join(", ")}.`;
  }
  return {
    zona,
    desde,
    hasta,
    lluviaPromMm: round1(lluviaProm),
    lluviaMin: { nombre: lo.nombre, mm: round1(lo.mm) },
    lluviaMax: { nombre: hi.nombre, mm: round1(hi.mm) },
    tmaxProm: round1(tmaxProm),
    tminProm: round1(tminProm),
    helada,
    texto,
    at,
  };
}

export async function pronosticos(f: Fetch, at: string): Promise<Record<Pais, PronosticoPais>> {
  const paises: Pais[] = ["AR", "BR", "US"];
  const todos = paises.flatMap((p) => ZONAS[p].puntos);
  const qs = new URLSearchParams({
    latitude: todos.map((p) => p.lat).join(","),
    longitude: todos.map((p) => p.lon).join(","),
    daily: "precipitation_sum,temperature_2m_max,temperature_2m_min",
    forecast_days: "7",
    timezone: "auto",
  });
  const data = await conTimeout(20_000, async (signal) => {
    const res = await f(`https://api.open-meteo.com/v1/forecast?${qs}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const j = (await res.json()) as OmDaily[] | OmDaily;
    return Array.isArray(j) ? j : [j];
  });
  if (data.length !== todos.length) throw new Error(`Open-Meteo: ${data.length}/${todos.length} puntos`);
  const out = {} as Record<Pais, PronosticoPais>;
  let k = 0;
  for (const p of paises) {
    const n = ZONAS[p].puntos.length;
    out[p] = resumirPronostico(p, data.slice(k, k + n), at);
    k += n;
  }
  return out;
}

/* ------------------------------ USDM ------------------------------ */

type UsdmRow = { mapDate?: string; areaOfInterest?: string; d1?: number; d3?: number };

export async function usdm(f: Fetch, now: Date, at: string): Promise<UsdmStat> {
  const fin = new Date(now.getTime());
  const ini = new Date(now.getTime() - 28 * 86400_000);
  const mdy = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  const url =
    "https://usdmdataservices.unl.edu/api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent" +
    `?aoi=conus&startdate=${mdy(ini)}&enddate=${mdy(fin)}&statisticsType=1`;
  const rows = await conTimeout(20_000, async (signal) => {
    const res = await f(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal, cache: "no-store" });
    if (!res.ok) throw new Error(`USDM HTTP ${res.status}`);
    return (await res.json()) as UsdmRow[];
  });
  const conus = (Array.isArray(rows) ? rows : [])
    .filter((r) => (r.areaOfInterest ?? "").toUpperCase() === "CONUS" && r.mapDate && typeof r.d1 === "number" && typeof r.d3 === "number")
    .sort((a, b) => (b.mapDate ?? "").localeCompare(a.mapDate ?? ""));
  if (!conus.length) throw new Error("USDM: sin datos CONUS");
  const [u, p] = conus;
  const mapDate = u.mapDate!.slice(0, 10);
  const d1d4 = round1(u.d1!);
  const d3d4 = round1(u.d3!);
  const delta = p ? round1(u.d1! - p.d1!) : null;
  const deltaTxt =
    delta == null ? "" : ` (${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${nf1.format(Math.abs(delta))} pp vs ${ddmm(p!.mapDate!.slice(0, 10))})`;
  return {
    mapDate,
    d1d4,
    d3d4,
    prevMapDate: p?.mapDate?.slice(0, 10) ?? null,
    deltaD1d4: delta,
    texto: `USDM ${ddmm(mapDate)}: ${nf1.format(d1d4)}% de EE.UU. contiguo en sequía D1–D4${deltaTxt}; severa a excepcional (D3–D4) ${nf1.format(d3d4)}%.`,
    at,
  };
}

/* ------------------------------ INMET ------------------------------ */

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export async function inmetDelMes(f: Fetch, now: Date, at: string): Promise<InmetBoletin> {
  const [y, m] = hoyArtIso(now).split("-").map(Number);
  const mes = MESES_PT[m - 1];
  const url = `https://portal.inmet.gov.br/noticias/boletim-agroclimatol%C3%B3gico-mensal-${encodeURIComponent(mes)}-${y}`;
  const status = await conTimeout(15_000, async (signal) => {
    const res = await f(url, { headers: { "User-Agent": UA }, signal, cache: "no-store", redirect: "follow" });
    return res.status;
  });
  if (status >= 500) throw new Error(`INMET HTTP ${status}`);
  return { mes: `${mes}/${y}`, url, publicado: status === 200, checkedAt: at };
}

/* ------------------------------ Blob ------------------------------ */

export async function readClimaBlob(): Promise<ClimaBlobFile | null> {
  if (!blobConfigured()) return null;
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(CLIMA_BLOB_PATH, { access, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as ClimaBlobFile;
    } catch {
      /* probar el otro modo */
    }
  }
  return null;
}

async function writeClimaBlob(file: ClimaBlobFile): Promise<void> {
  const body = JSON.stringify(file, null, 2);
  let lastErr: unknown = null;
  for (const access of ["private", "public"] as const) {
    try {
      await put(CLIMA_BLOB_PATH, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/* ------------------------------ Corrida ------------------------------ */

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Corre la actualización. `persist=false` (pruebas locales) no escribe en Blob.
 * Cada fuente es independiente: si falla, se conserva su valor anterior.
 * `actualizadoAt` sólo avanza si el pronóstico (la parte diaria) salió bien.
 */
export async function refreshClima(
  opts: { now?: Date; persist?: boolean; fetchImpl?: Fetch; prev?: ClimaBlobFile | null } = {},
) {
  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const t0 = Date.now();
  const f = opts.fetchImpl ?? fetch;
  const prev = opts.prev !== undefined ? opts.prev : await readClimaBlob().catch(() => null);
  const [pr, us, br] = await Promise.allSettled([pronosticos(f, at), usdm(f, now, at), inmetDelMes(f, now, at)]);
  const errores: string[] = [];
  if (pr.status === "rejected") errores.push(msg(pr.reason));
  if (us.status === "rejected") errores.push(msg(us.reason));
  if (br.status === "rejected") errores.push(msg(br.reason));
  const pronOk = pr.status === "fulfilled";

  const file: ClimaBlobFile = {
    actualizadoAt: pronOk ? at : (prev?.actualizadoAt ?? null),
    pronostico: pronOk ? pr.value : (prev?.pronostico ?? {}),
    usdm: us.status === "fulfilled" ? us.value : (prev?.usdm ?? null),
    inmet: br.status === "fulfilled" ? br.value : (prev?.inmet ?? null),
    ultimaCorrida: { at, ok: errores.length === 0, ms: Date.now() - t0, errores: errores.slice(0, 10).map((e) => e.slice(0, 200)) },
  };

  let blobWritten = false;
  let blobError: string | null = null;
  if (opts.persist !== false) {
    if (!blobConfigured()) blobError = "blob no configurado";
    else {
      try {
        await writeClimaBlob(file);
        blobWritten = true;
      } catch (e) {
        blobError = msg(e);
      }
    }
  }
  return {
    file,
    resumen: {
      ok: pronOk,
      pronostico: pronOk ? (["AR", "BR", "US"] as const).map((p) => `${p} ${pr.value[p].lluviaPromMm} mm`) : null,
      usdm: us.status === "fulfilled" ? us.value.mapDate : null,
      inmet: br.status === "fulfilled" ? `${br.value.mes} ${br.value.publicado ? "publicado" : "no publicado"}` : null,
      errores,
      blobWritten,
      blobError,
    },
  };
}
