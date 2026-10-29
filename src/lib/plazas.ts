import { a3500Vigente, fetchA3500, FUENTE_A3500, type CotizacionFx } from "@/lib/bcra";
import {
  dmyToIso,
  frescura,
  hoyArtIso,
  isoToDm,
  REGLAS,
  type Frescura,
} from "@/lib/habiles";
import {
  mergeSerie,
  previoEnSerie,
  readSerie,
  type SerieFile,
} from "@/lib/serie-blob";

/**
 * Plazas físicas — UNA fuente por plaza, fetch server-side directo:
 *  - Pizarra CAC Rosario: Cámara Arbitral de Cereales, Bolsa de Comercio de Rosario
 *      https://www.cac.bcr.com.ar/es/precios-de-pizarra (+ /consultas para el cierre previo)
 *  - AFA San Martín: pizarra diaria AFA SCL (AFA Diario · Mercados en línea
 *      + Comparativo Pizarra para el cierre previo)
 *  ACA retirada 04/10 (su "Pizarra" web sólo sale con clave de terceros). FOB Up River (MAGYP) retirado 25/9.
 * Var diaria = último cierre publicado vs cierre publicado anterior de la MISMA fuente.
 * Sin cierre previo → var null. Nunca se inventan precios ni variaciones.
 */

export type Grano = "soja" | "maiz" | "trigo";
export const GRANOS: Grano[] = ["soja", "maiz", "trigo"];
/** Granos de la pizarra CAC Rosario (incluye girasol y sorgo, sólo CAC). */
export type GranoPizarra = Grano | "girasol" | "sorgo";
export const GRANOS_CAC: GranoPizarra[] = ["soja", "maiz", "trigo", "girasol", "sorgo"];

export interface CotizacionGrano {
  grano: GranoPizarra;
  /** Precio publicado en la moneda de la fuente */
  valor: number;
  unidad: "ARS/t" | "US$/t";
  fecha: string; // yyyy-mm-dd
  prev: { valor: number; fecha: string } | null;
  abs: number | null;
  pct: number | null; // decimal
  estimativo?: boolean;
  /** Conversión a US$ (sólo plazas en ARS) con BCRA A3500 de la fecha del dato */
  usd?: number | null;
  tc?: { valor: number; fecha: string; fuente: string } | null;
  /** Hora de publicación de la fuente (hh:mm ART), si la informa */
  hora?: string | null;
  /** Plaza del precio cuando difiere de la plaza de la columna (ej. AFA sorgo → Rosario) */
  lugar?: string | null;
}

/** Producto que la fuente lista ese día sin precio ("sin cotización"). */
export interface SinCotizacion {
  grano: GranoPizarra;
  fecha: string; // yyyy-mm-dd de la pizarra
  lugar: string | null;
}

export interface PlazaSnapshot {
  id: "cac" | "afa";
  nombre: string;
  lugar: string;
  fuente: string;
  url: string;
  fecha: string | null;
  frescura: Frescura;
  granos: CotizacionGrano[];
  /** Productos publicados sin precio ese día (se muestran como "sin cotización"). */
  sinCotizacion?: SinCotizacion[];
  error: string | null;
}

export interface PlazasSnapshot {
  cac: PlazaSnapshot;
  afa: PlazaSnapshot;
  /** Tipo de cambio usado para pasar pizarras a US$/t. */
  fxA3500: CotizacionFx | null;
  fxA3500Prev: { valor: number; fecha: string } | null;
  /** BNA billete minorista venta. No se usa para convertir granos. */
  fxBilleteVenta: CotizacionFx | null;
  /** BNA divisa comprador. Informativo: no es el A3500 y no convierte pizarras. */
  fxBnaDivisa: { valor: number; fecha: string; fuente: string } | null;
  /** Cierre BNA divisa comprador anterior (serie Blob), sólo para mostrar la variación de ese tipo. */
  fxBnaDivisaPrev: { valor: number; fecha: string } | null;
  persistencia: { written: boolean; error: string | null; updatedAt: string | null; reason: string | null };
  fetchedAt: string;
}

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const CAC_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra";
const CAC_CONSULTA_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas";
const CAC_PRODUCT: Record<GranoPizarra, string> = { soja: "13", maiz: "3", trigo: "8", girasol: "9", sorgo: "6" };

export const AFA_URL = "https://www.afascl.coop/afadiario/mercados-en-linea";
const AFA_COMP_URL = "https://www.afascl.coop/afadiario/comparativo-pizarra";
const AFA_GRANO: Record<GranoPizarra, string> = { soja: "Soja", maiz: "Maiz", trigo: "Trigo", girasol: "Girasol", sorgo: "Sorgo" };
/** Productos que se leen de la pizarra AFA (mismos que la CAC). */
const GRANOS_AFA: GranoPizarra[] = ["soja", "maiz", "trigo", "girasol", "sorgo"];
/** Soja, maíz y trigo se toman sólo de San Martín (como siempre); girasol y sorgo, de la plaza que publique AFA. */
const AFA_SOLO_SAN_MARTIN: GranoPizarra[] = ["soja", "maiz", "trigo"];

const BNA_URL = "https://www.bna.com.ar/Personas";
export const FUENTE_BILLETE = "BNA billete venta (minorista)";
export const FUENTE_DIVISA_COMPRA = "BNA divisa comprador";

type FetchOpts = { fresh?: boolean; revalidate?: number };

async function fetchText(
  url: string,
  init: RequestInit & FetchOpts = {},
): Promise<string> {
  const { fresh, revalidate = 600, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { "User-Agent": UA, Accept: "text/html,application/json", ...(rest.headers ?? {}) },
      signal: ctrl.signal,
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** "$560.000,00" | "1.507,00" → 560000 | 1507 */
function parseArNum(s: string): number | null {
  const m = s.match(/[0-9][0-9.]*(?:,[0-9]+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function varDe(valor: number, prev: { valor: number } | null) {
  if (!prev || !(prev.valor > 0)) return { abs: null, pct: null };
  const abs = valor - prev.valor;
  return { abs, pct: abs / prev.valor };
}

function isoDaysAgo(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

function emptyPlaza(
  id: PlazaSnapshot["id"],
  nombre: string,
  lugar: string,
  fuente: string,
  url: string,
  error: string,
): PlazaSnapshot {
  return { id, nombre, lugar, fuente, url, fecha: null, frescura: "vencido", granos: [], error };
}

/* ---------------------------- BNA ---------------------------- */

export interface BnaCotizaciones {
  /** Venta de billete minorista (coma decimal en la página). */
  billeteVenta: CotizacionFx | null;
  /** Compra de divisa (punto decimal). No es el A3500. */
  divisaCompra: CotizacionFx | null;
}

/** Separa billete (coma) y divisa (punto). El primer bloque de la página es billetes. */
export function parseBna(txt: string): BnaCotizaciones {
  const billete = txt.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta\s+Dolar U\.S\.A\s+[0-9.]+,[0-9]{2}\s+([0-9.]+,[0-9]{2})/,
  );
  const divisa = txt.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta\s+Dolar U\.S\.A\s+([0-9]+\.[0-9]{2,4})\s+[0-9]+\.[0-9]{2,4}/,
  );
  const fechaB = dmyToIso(billete?.[1]);
  const venta = billete ? Number(billete[2].replace(/\./g, "").replace(",", ".")) : NaN;
  const fechaD = dmyToIso(divisa?.[1]);
  const compra = divisa ? Number(divisa[2]) : NaN;
  return {
    billeteVenta:
      fechaB && Number.isFinite(venta) && venta > 0
        ? { valor: venta, fecha: fechaB, fuente: FUENTE_BILLETE }
        : null,
    divisaCompra:
      fechaD && Number.isFinite(compra) && compra > 0
        ? { valor: compra, fecha: fechaD, fuente: FUENTE_DIVISA_COMPRA }
        : null,
  };
}

async function fetchBna(o: FetchOpts): Promise<BnaCotizaciones> {
  try {
    return parseBna(stripHtml(await fetchText(BNA_URL, o)));
  } catch {
    return { billeteVenta: null, divisaCompra: null };
  }
}

/* ------------------------------- CAC -------------------------------- */

interface CacBoard {
  fecha: string;
  tc: { valor: number; fecha: string } | null;
  granos: Partial<Record<GranoPizarra, { ars: number | null; usd: number | null; estimativo: boolean }>>;
}

function parseCacBoard(html: string): CacBoard | null {
  const fm = html.match(/Precios Pizarra del d[ií]a\s*(\d{2}\/\d{2}\/\d{4})/i);
  const fecha = dmyToIso(fm?.[1]);
  if (!fecha) return null;
  const granos: CacBoard["granos"] = {};
  for (const g of GRANOS_CAC) {
    const re = new RegExp(`class="board board-${g}[^"]*"([\\s\\S]*?)<div class="bottom" style="text-align: center;">`, "i");
    const bm = html.match(re);
    if (!bm) continue;
    const block = bm[1];
    const priceHtml = block.match(/<div class="price">([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const priceTxt = stripHtml(priceHtml);
    const usdHtml = block.match(/<strong>US\$<\/strong>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const usdTxt = stripHtml(usdHtml);
    // "S/C (E) $765.328" = sin cotización, precio estimativo de la Cámara → se muestra marcado (E).
    // "S/C" sin precio → ars null → s/d (nunca 0).
    const estimativo = /\(E\)/i.test(priceTxt);
    granos[g] = { ars: parseArNum(priceTxt.replace(/S\/C/gi, "")), usd: parseArNum(usdTxt), estimativo };
  }
  const tm = html.match(/Comprador\s*(\d{2}\/\d{2}\/\d{4})\s*:\s*<strong>\s*\$\s*([0-9.,]+)/i);
  const tcFecha = dmyToIso(tm?.[1]);
  const tcVal = tm ? parseArNum(tm[2]) : null;
  return { fecha, tc: tcFecha && tcVal ? { valor: tcVal, fecha: tcFecha } : null, granos };
}

async function fetchCacHistorial(
  g: GranoPizarra,
  hoy: string,
  o: FetchOpts,
): Promise<Array<{ fecha: string; ars: number; estimativo: boolean }>> {
  const qs = new URLSearchParams({
    product: CAC_PRODUCT[g],
    type: "any",
    // La consulta pagina de a 10 filas: ventana de 10 días corridos (≤ 8 hábiles).
    date_start: isoDaysAgo(hoy, 10),
    date_end: hoy,
    period: "day",
  });
  const html = await fetchText(`${CAC_CONSULTA_URL}?${qs}`, o);
  const out: Array<{ fecha: string; ars: number; estimativo: boolean }> = [];
  const re =
    /<td class="text-center">\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td class="estimative">([\s\S]*?)<\/td>\s*<td class="text-center">([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const fecha = dmyToIso(m[1]);
    const priceTxt = stripHtml(m[3]);
    if (!fecha || /S\/C/i.test(priceTxt) && !/\$/.test(priceTxt)) continue;
    const ars = parseArNum(priceTxt);
    if (ars == null || ars <= 0) continue;
    out.push({ fecha, ars, estimativo: /\(E\)/i.test(m[2]) || /\(E\)/i.test(priceTxt) });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Red de la CAC (pizarra + historiales). Nunca rechaza: cada fetch cae a vacío. */
function fetchCacRaw(hoy: string, o: FetchOpts) {
  return Promise.all([
    fetchText(CAC_URL, o).catch(() => ""),
    ...GRANOS_CAC.map((g) => fetchCacHistorial(g, hoy, o).catch(() => [] as Awaited<ReturnType<typeof fetchCacHistorial>>)),
  ] as const);
}

async function getCac(
  hoy: string,
  o: FetchOpts,
  serie: SerieFile,
  fx: (fecha: string) => { valor: number; fecha: string; fuente: string } | null,
  raw?: ReturnType<typeof fetchCacRaw>,
): Promise<PlazaSnapshot> {
  const base = {
    id: "cac" as const,
    nombre: "Pizarra CAC Rosario",
    lugar: "Rosario",
    fuente: "Cámara Arbitral de Cereales · BCR",
    url: CAC_URL,
  };
  try {
    const [boardHtml, ...hists] = await (raw ?? fetchCacRaw(hoy, o));
    const board = boardHtml ? parseCacBoard(boardHtml) : null;
    const granos: CotizacionGrano[] = [];
    GRANOS_CAC.forEach((g, i) => {
      const hist = hists[i];
      const last = hist[hist.length - 1];
      const b = board?.granos[g];
      // Último cierre: el más reciente entre pizarra del día y consulta histórica.
      let fecha: string | null = null;
      let ars: number | null = null;
      let estimativo = false;
      if (board && b?.ars != null && (!last || board.fecha >= last.fecha)) {
        fecha = board.fecha;
        ars = b.ars;
        estimativo = b.estimativo;
      } else if (last) {
        fecha = last.fecha;
        ars = last.ars;
        estimativo = last.estimativo;
      }
      if (!fecha || ars == null) return;
      const prevHist = [...hist].reverse().find((h) => h.fecha < fecha!);
      const prev = prevHist
        ? { valor: prevHist.ars, fecha: prevHist.fecha }
        : previoEnSerie(serie, "cac.ars", g, fecha) ;
      let usd: number | null = null;
      let tc: CotizacionGrano["tc"] = null;
      // Siempre A3500. El US$ que imprime la CAC usa su propia divisa comprador y no se muestra.
      const t = fx(fecha);
      if (t) {
        usd = Math.round((ars / t.valor) * 100) / 100;
        tc = t;
      }
      granos.push({ grano: g, valor: ars, unidad: "ARS/t", fecha, prev, ...varDe(ars, prev), estimativo, usd, tc });
    });
    if (granos.length === 0) return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, "CAC: sin precios parseables");
    const fecha = granos.map((x) => x.fecha).sort().pop()!;
    return { ...base, fecha, frescura: frescura(fecha, REGLAS.cac), granos, error: null };
  } catch (err) {
    return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, `CAC: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------- AFA -------------------------------- */

async function fetchAfaComparativo(g: GranoPizarra, hoy: string, o: FetchOpts): Promise<Array<{ fecha: string; ars: number }>> {
  const body = new URLSearchParams({ cboGranos: AFA_GRANO[g], txtFD: isoDaysAgo(hoy, 21), txtFH: hoy, submit: "" });
  const html = await fetchText(AFA_COMP_URL, {
    method: "POST",
    body: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    ...o,
  });
  const out: Array<{ fecha: string; ars: number }> = [];
  const re = /<td class="bg-light text-center">\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td class="text-right">\s*([0-9.]+)\s*<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const fecha = dmyToIso(m[1]);
    const ars = Number(m[2].replace(/\./g, ""));
    if (fecha && Number.isFinite(ars) && ars > 0) out.push({ fecha, ars });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Red de AFA (pizarra + comparativos). Nunca rechaza: cada fetch cae a vacío. */
function fetchAfaRaw(hoy: string, o: FetchOpts) {
  return Promise.all([
    fetchText(AFA_URL, o).catch(() => ""),
    ...GRANOS_AFA.map((g) => fetchAfaComparativo(g, hoy, o).catch(() => [] as Array<{ fecha: string; ars: number }>)),
  ] as const);
}

async function getAfa(
  hoy: string,
  o: FetchOpts,
  serie: SerieFile,
  fx: (fecha: string) => { valor: number; fecha: string; fuente: string } | null,
  raw?: ReturnType<typeof fetchAfaRaw>,
): Promise<PlazaSnapshot> {
  const base = {
    id: "afa" as const,
    nombre: "AFA San Martín",
    lugar: "San Martín",
    fuente: "AFA SCL · pizarra diaria",
    url: AFA_URL,
  };
  try {
    const [pageHtml, ...comps] = await (raw ?? fetchAfaRaw(hoy, o));
    const txt = pageHtml ? stripHtml(pageHtml) : "";
    const granos: CotizacionGrano[] = [];
    const sinCotizacion: SinCotizacion[] = [];
    GRANOS_AFA.forEach((g, i) => {
      const label = g === "maiz" ? "Ma[ií]z" : AFA_GRANO[g];
      const soloSM = AFA_SOLO_SAN_MARTIN.includes(g);
      const plaza = soloSM ? "San Mart[ií]n" : "[A-Za-zÁÉÍÓÚáéíóúÑñ. ]+?";
      // Tarjeta de la pizarra: "dd/mm/aaaa <Producto> <Plaza> $ <precio>" (o sin precio: "S/C", "-").
      const m = txt.match(
        new RegExp(`(\\d{2}/\\d{2}/\\d{4})\\s+${label}\\s+(${plaza})\\s+(?:\\$\\s*([0-9.]+)|(S/?C|sin cotizaci[oó]n|-+))`, "i"),
      );
      const comp = comps[i];
      let fecha: string | null = null;
      let ars: number | null = null;
      const pf = dmyToIso(m?.[1]);
      const lugarPag = m?.[2]?.trim() ?? null;
      const pv = m?.[3] ? Number(m[3].replace(/\./g, "")) : NaN;
      const lastComp = comp[comp.length - 1];
      // Lugar sólo si no es la plaza de la columna (San Martín).
      const lugar = lugarPag && !/^San Mart[ií]n$/i.test(lugarPag) ? lugarPag : null;
      if (pf && Number.isFinite(pv) && pv > 0 && (!lastComp || pf >= lastComp.fecha)) {
        fecha = pf;
        ars = pv;
      } else if (pf && !(pv > 0) && (!lastComp || pf > lastComp.fecha)) {
        // AFA lista el producto ese día sin precio: "sin cotización", no se rellena con días anteriores.
        sinCotizacion.push({ grano: g, fecha: pf, lugar });
        return;
      } else if (lastComp) {
        fecha = lastComp.fecha;
        ars = lastComp.ars;
      }
      if (!fecha || ars == null) return;
      const prevComp = [...comp].reverse().find((c) => c.fecha < fecha!);
      const prev = prevComp
        ? { valor: prevComp.ars, fecha: prevComp.fecha }
        : previoEnSerie(serie, "afa.ars", g, fecha);
      const t = fx(fecha);
      const usd = t ? Math.round((ars / t.valor) * 100) / 100 : null;
      granos.push({ grano: g, valor: ars, unidad: "ARS/t", fecha, prev, ...varDe(ars, prev), usd, tc: t, lugar: fecha === pf ? lugar : null });
    });
    if (granos.length === 0) return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, "AFA: sin precios parseables");
    // Fecha de la plaza: la de soja/maíz/trigo como siempre (girasol/sorgo sólo si no hay ninguno de esos).
    const core = granos.filter((x) => AFA_SOLO_SAN_MARTIN.includes(x.grano));
    const fecha = (core.length ? core : granos).map((x) => x.fecha).sort().pop()!;
    return { ...base, fecha, frescura: frescura(fecha, REGLAS.afa), granos, sinCotizacion, error: null };
  } catch (err) {
    return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, `AFA: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------ Público ----------------------------- */

function isoDiasAtras(iso: string, n: number): string {
  return isoDaysAgo(iso, n);
}

function puntosA3500(file: SerieFile): CotizacionFx[] {
  const g = file.series["fx.a3500"]?.usd ?? {};
  return Object.entries(g)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .map(([fecha, valor]) => ({ fecha, valor, fuente: FUENTE_A3500 }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function getPlazas(opts: { fresh?: boolean; persist?: boolean } = {}): Promise<PlazasSnapshot> {
  const hoy = hoyArtIso();
  const o: FetchOpts = { fresh: opts.fresh };
  // Toda la red en paralelo. La conversión a US$ usa sólo el A3500 (no la divisa del BNA ni la de la CAC).
  const cacRaw = fetchCacRaw(hoy, o);
  const afaRaw = fetchAfaRaw(hoy, o);
  const [serie, bna, a3500Live] = await Promise.all([
    readSerie().catch(() => ({ updatedAt: null, series: {} }) as SerieFile),
    fetchBna(o),
    fetchA3500({ desde: isoDiasAtras(hoy, 21), hasta: hoy }).catch(() => [] as CotizacionFx[]),
  ]);

  const serieA3500 = puntosA3500(serie);
  const a3500 = [...serieA3500];
  for (const c of a3500Live) {
    const i = a3500.findIndex((x) => x.fecha === c.fecha);
    if (i >= 0) a3500[i] = c;
    else a3500.push(c);
  }
  a3500.sort((x, y) => x.fecha.localeCompare(y.fecha));
  const fxA3500 = a3500.length ? a3500[a3500.length - 1] : null;

  const fx = (fecha: string) => a3500Vigente(a3500, fecha);

  const cac = await getCac(hoy, o, serie, fx, cacRaw);
  const afa = await getAfa(hoy, o, serie, fx, afaRaw);

  let persistencia: PlazasSnapshot["persistencia"] = {
    written: false,
    error: null,
    updatedAt: serie.updatedAt,
    reason: "omitido",
  };
  if (opts.persist !== false) {
    const puntos: Array<{ serie: string; grano: string; fecha: string; valor: number }> = [];
    for (const [p, serieId] of [[cac, "cac.ars"], [afa, "afa.ars"]] as const) {
      for (const g of p.granos) {
        const gk = g.grano;
        puntos.push({ serie: serieId, grano: gk, fecha: g.fecha, valor: g.valor });
        if (g.prev) puntos.push({ serie: serieId, grano: gk, fecha: g.prev.fecha, valor: g.prev.valor });
        if (g.usd != null) puntos.push({ serie: p.id === "cac" ? "cac.usd" : "afa.usd", grano: g.grano, fecha: g.fecha, valor: g.usd });
      }
    }
    for (const c of a3500Live) puntos.push({ serie: "fx.a3500", grano: "usd", fecha: c.fecha, valor: c.valor });
    // La serie fx.bna sigue siendo divisa comprador (histórico). No se mezcla con el billete ni con el A3500.
    if (bna.divisaCompra) {
      puntos.push({ serie: "fx.bna", grano: "usd", fecha: bna.divisaCompra.fecha, valor: bna.divisaCompra.valor });
    }
    try {
      const r = await mergeSerie(puntos);
      persistencia = {
        written: r.written,
        error: r.error,
        updatedAt: r.written ? new Date().toISOString() : serie.updatedAt,
        reason: r.reason,
      };
    } catch (err) {
      persistencia = {
        written: false,
        error: err instanceof Error ? err.message : String(err),
        updatedAt: serie.updatedAt,
        reason: "error",
      };
    }
  }

  const divisa = bna.divisaCompra;
  const fxPrev = divisa ? previoEnSerie(serie, "fx.bna", "usd", divisa.fecha) : null;
  const a3500Prev = fxA3500
    ? a3500.filter((c) => c.fecha < fxA3500.fecha).pop() ?? null
    : null;
  return {
    cac,
    afa,
    fxA3500,
    fxA3500Prev: a3500Prev ? { valor: a3500Prev.valor, fecha: a3500Prev.fecha } : null,
    fxBilleteVenta: bna.billeteVenta,
    fxBnaDivisa: divisa,
    fxBnaDivisaPrev: fxPrev,
    persistencia,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------ Formato ----------------------------- */

const MINUS = "−";

function fmt(n: number, digits: number): string {
  return Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPrecio(g: CotizacionGrano): string {
  return g.unidad === "ARS/t" ? fmt(g.valor, 0) : fmt(g.valor, g.valor % 1 === 0 ? 0 : 1);
}

/** "(−0,5 · −0,1%)" | null si no hay cierre previo. */
export function fmtVar(g: CotizacionGrano): string | null {
  if (g.abs == null || g.pct == null) return null;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? MINUS : "");
  const absDigits = g.unidad === "ARS/t" ? 0 : Number.isInteger(g.abs) ? 0 : 1;
  const pctR = Math.round(g.pct * 1000) / 10;
  return `${sign(g.abs)}${fmt(g.abs, absDigits)} · ${sign(pctR)}${fmt(pctR, 1)}%`;
}

const LABEL: Record<GranoPizarra, string> = { soja: "soja", maiz: "maíz", trigo: "trigo", girasol: "girasol", sorgo: "sorgo" };

/**
 * Línea del Resumen matutino, mismo formato visual que el texto CoS:
 *   "AFA San Martín (24/09): soja 575.000 $/t (+5.000 · +0,9%) · maíz …"
 * null si la plaza no tiene dato mostrable (vencido o sin precios).
 */
export function lineaResumen(p: PlazaSnapshot): string | null {
  if (p.frescura === "vencido" || p.granos.length === 0 || !p.fecha) return null;
  const head =
    p.id === "cac" ? "Rosario CAC" : "AFA San Martín";
  const tag = `${isoToDm(p.fecha)}${p.frescura === "viejo" ? " · viejo" : ""}`;
  // Resumen: mismo formato de siempre (soja · maíz · trigo).
  const parts = p.granos.filter((g) => (GRANOS as string[]).includes(g.grano)).map((g) => {
    const unit = g.unidad === "ARS/t" ? "$/t" : "US$/t";
    const v = fmtVar(g);
    return `${LABEL[g.grano]} ${fmtPrecio(g)} ${unit}${v ? ` (${v})` : ""}`;
  });
  return `${head} (${tag}): ${parts.join(" · ")}`;
}
