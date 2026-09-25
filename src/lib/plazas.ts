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
  valorEnSerie,
  type SerieFile,
} from "@/lib/serie-blob";
import { getAca, type AcaSnapshot } from "@/lib/aca";

/**
 * Plazas físicas — UNA fuente por plaza, fetch server-side directo:
 *  - Pizarra CAC Rosario: Cámara Arbitral de Cereales, Bolsa de Comercio de Rosario
 *      https://www.cac.bcr.com.ar/es/precios-de-pizarra (+ /consultas para el cierre previo)
 *  - AFA San Martín: pizarra diaria AFA SCL (AFA Diario · Mercados en línea
 *      + Comparativo Pizarra para el cierre previo)
 *  - ACA (Asociación de Cooperativas Argentinas): físico por puerto, posición disponible
 *      en $/t (src/lib/aca.ts). FOB Up River (MAGYP) retirado 25/9 por pedido de Diego.
 * Var diaria = último cierre publicado vs cierre publicado anterior de la MISMA fuente.
 * Sin cierre previo → var null. Nunca se inventan precios ni variaciones.
 */

export type Grano = "soja" | "maiz" | "trigo";
export const GRANOS: Grano[] = ["soja", "maiz", "trigo"];

export interface CotizacionGrano {
  grano: Grano;
  /** Precio publicado en la moneda de la fuente */
  valor: number;
  unidad: "ARS/t" | "US$/t";
  fecha: string; // yyyy-mm-dd
  prev: { valor: number; fecha: string } | null;
  abs: number | null;
  pct: number | null; // decimal
  estimativo?: boolean;
  /** Conversión a US$ (sólo plazas en ARS) con BNA divisa comprador de la fecha del dato */
  usd?: number | null;
  tc?: { valor: number; fecha: string; fuente: string } | null;
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
  error: string | null;
}

export interface PlazasSnapshot {
  cac: PlazaSnapshot;
  afa: PlazaSnapshot;
  /** ACA · físico por puerto, sólo disponible en $/t */
  aca: AcaSnapshot;
  fxBnaDivisa: { valor: number; fecha: string; fuente: string } | null;
  persistencia: { written: boolean; error: string | null; updatedAt: string | null };
  fetchedAt: string;
}

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const CAC_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra";
const CAC_CONSULTA_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas";
const CAC_PRODUCT: Record<Grano, string> = { soja: "13", maiz: "3", trigo: "8" };

export const AFA_URL = "https://www.afascl.coop/afadiario/mercados-en-linea";
const AFA_COMP_URL = "https://www.afascl.coop/afadiario/comparativo-pizarra";
const AFA_GRANO: Record<Grano, string> = { soja: "Soja", maiz: "Maiz", trigo: "Trigo" };

const BNA_URL = "https://www.bna.com.ar/Personas";

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

/* ---------------------------- BNA divisa ---------------------------- */

async function fetchBnaDivisa(o: FetchOpts): Promise<{ valor: number; fecha: string; fuente: string } | null> {
  try {
    const txt = stripHtml(await fetchText(BNA_URL, o));
    // Tabla "Cotización Divisas": números con punto decimal y 4 decimales (billetes usa coma).
    const re = /(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta\s+Dolar U\.S\.A\s+([0-9]+\.[0-9]{2,4})\s+([0-9]+\.[0-9]{2,4})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      const fecha = dmyToIso(m[1]);
      const valor = Number(m[2]);
      if (fecha && Number.isFinite(valor) && valor > 0) {
        return { valor, fecha, fuente: "BNA divisa comprador" };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------- CAC -------------------------------- */

interface CacBoard {
  fecha: string;
  tc: { valor: number; fecha: string } | null;
  granos: Partial<Record<Grano, { ars: number | null; usd: number | null; estimativo: boolean }>>;
}

function parseCacBoard(html: string): CacBoard | null {
  const fm = html.match(/Precios Pizarra del d[ií]a\s*(\d{2}\/\d{2}\/\d{4})/i);
  const fecha = dmyToIso(fm?.[1]);
  if (!fecha) return null;
  const granos: CacBoard["granos"] = {};
  for (const g of GRANOS) {
    const re = new RegExp(`class="board board-${g}[^"]*"([\\s\\S]*?)<div class="bottom" style="text-align: center;">`, "i");
    const bm = html.match(re);
    if (!bm) continue;
    const block = bm[1];
    const priceHtml = block.match(/<div class="price">([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const priceTxt = stripHtml(priceHtml);
    const usdHtml = block.match(/<strong>US\$<\/strong>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const usdTxt = stripHtml(usdHtml);
    const estimativo = /\(E\)|S\/C/i.test(priceTxt);
    granos[g] = { ars: parseArNum(priceTxt.replace(/S\/C/gi, "")), usd: parseArNum(usdTxt), estimativo };
  }
  const tm = html.match(/Comprador\s*(\d{2}\/\d{2}\/\d{4})\s*:\s*<strong>\s*\$\s*([0-9.,]+)/i);
  const tcFecha = dmyToIso(tm?.[1]);
  const tcVal = tm ? parseArNum(tm[2]) : null;
  return { fecha, tc: tcFecha && tcVal ? { valor: tcVal, fecha: tcFecha } : null, granos };
}

async function fetchCacHistorial(
  g: Grano,
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

async function getCac(
  hoy: string,
  o: FetchOpts,
  serie: SerieFile,
  fx: (fecha: string) => { valor: number; fecha: string; fuente: string } | null,
): Promise<PlazaSnapshot> {
  const base = {
    id: "cac" as const,
    nombre: "Pizarra CAC Rosario",
    lugar: "Rosario",
    fuente: "Cámara Arbitral de Cereales · BCR",
    url: CAC_URL,
  };
  try {
    const [boardHtml, ...hists] = await Promise.all([
      fetchText(CAC_URL, o).catch(() => ""),
      ...GRANOS.map((g) => fetchCacHistorial(g, hoy, o).catch(() => [])),
    ]);
    const board = boardHtml ? parseCacBoard(boardHtml) : null;
    const granos: CotizacionGrano[] = [];
    GRANOS.forEach((g, i) => {
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
      if (board && board.fecha === fecha && b?.usd != null && board.tc) {
        usd = b.usd;
        tc = { ...board.tc, fuente: "BNA divisa comprador (CAC)" };
      } else {
        const t = fx(fecha);
        if (t) {
          usd = Math.round((ars / t.valor) * 100) / 100;
          tc = t;
        }
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

async function fetchAfaComparativo(g: Grano, hoy: string, o: FetchOpts): Promise<Array<{ fecha: string; ars: number }>> {
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

async function getAfa(
  hoy: string,
  o: FetchOpts,
  serie: SerieFile,
  fx: (fecha: string) => { valor: number; fecha: string; fuente: string } | null,
): Promise<PlazaSnapshot> {
  const base = {
    id: "afa" as const,
    nombre: "AFA San Martín",
    lugar: "San Martín",
    fuente: "AFA SCL · pizarra diaria",
    url: AFA_URL,
  };
  try {
    const [pageHtml, ...comps] = await Promise.all([
      fetchText(AFA_URL, o).catch(() => ""),
      ...GRANOS.map((g) => fetchAfaComparativo(g, hoy, o).catch(() => [])),
    ]);
    const txt = pageHtml ? stripHtml(pageHtml) : "";
    const granos: CotizacionGrano[] = [];
    GRANOS.forEach((g, i) => {
      const label = g === "maiz" ? "Ma[ií]z" : AFA_GRANO[g];
      const m = txt.match(new RegExp(`(\\d{2}/\\d{2}/\\d{4})\\s+${label}\\s+San Mart[ií]n\\s+\\$\\s*([0-9.]+)`, "i"));
      const comp = comps[i];
      let fecha: string | null = null;
      let ars: number | null = null;
      const pf = dmyToIso(m?.[1]);
      const pv = m ? Number(m[2].replace(/\./g, "")) : NaN;
      const lastComp = comp[comp.length - 1];
      if (pf && Number.isFinite(pv) && pv > 0 && (!lastComp || pf >= lastComp.fecha)) {
        fecha = pf;
        ars = pv;
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
      granos.push({ grano: g, valor: ars, unidad: "ARS/t", fecha, prev, ...varDe(ars, prev), usd, tc: t });
    });
    if (granos.length === 0) return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, "AFA: sin precios parseables");
    const fecha = granos.map((x) => x.fecha).sort().pop()!;
    return { ...base, fecha, frescura: frescura(fecha, REGLAS.afa), granos, error: null };
  } catch (err) {
    return emptyPlaza(base.id, base.nombre, base.lugar, base.fuente, base.url, `AFA: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------ Público ----------------------------- */

export async function getPlazas(opts: { fresh?: boolean; persist?: boolean } = {}): Promise<PlazasSnapshot> {
  const hoy = hoyArtIso();
  const o: FetchOpts = { fresh: opts.fresh };
  const [serie, bna] = await Promise.all([readSerie().catch(() => ({ updatedAt: null, series: {} })), fetchBnaDivisa(o)]);

  const fx = (fecha: string) => {
    if (bna && bna.fecha === fecha) return bna;
    const v = valorEnSerie(serie, "fx.bna", "usd", fecha);
    return v != null ? { valor: v, fecha, fuente: "BNA divisa comprador" } : null;
  };

  const cac = await getCac(hoy, o, serie, fx);
  // TC de la CAC (BNA divisa comprador de su fecha) también sirve para AFA de esa fecha.
  const cacTc = cac.granos.find((g) => g.tc?.fuente.includes("CAC"))?.tc ?? null;
  const fx2 = (fecha: string) => fx(fecha) ?? (cacTc && cacTc.fecha === fecha ? cacTc : null);
  const [afa, aca] = await Promise.all([getAfa(hoy, o, serie, fx2), getAca(o)]);

  let persistencia: PlazasSnapshot["persistencia"] = { written: false, error: null, updatedAt: serie.updatedAt };
  if (opts.persist !== false) {
    const puntos: Array<{ serie: string; grano: string; fecha: string; valor: number }> = [];
    for (const [p, serieId] of [[cac, "cac.ars"], [afa, "afa.ars"]] as const) {
      for (const g of p.granos) {
        puntos.push({ serie: serieId, grano: g.grano, fecha: g.fecha, valor: g.valor });
        if (g.prev) puntos.push({ serie: serieId, grano: g.grano, fecha: g.prev.fecha, valor: g.prev.valor });
        if (p.id === "cac" && g.usd != null && g.tc?.fuente.includes("CAC")) {
          puntos.push({ serie: "cac.usd", grano: g.grano, fecha: g.fecha, valor: g.usd });
        }
      }
    }
    for (const f of aca.filas) {
      if (f.valor != null && f.fechaPub) puntos.push({ serie: "aca.ars", grano: f.key, fecha: f.fechaPub, valor: f.valor });
    }
    if (bna) puntos.push({ serie: "fx.bna", grano: "usd", fecha: bna.fecha, valor: bna.valor });
    if (cacTc) puntos.push({ serie: "fx.bna", grano: "usd", fecha: cacTc.fecha, valor: cacTc.valor });
    try {
      const r = await mergeSerie(puntos);
      persistencia = { written: r.written, error: r.error, updatedAt: r.written ? new Date().toISOString() : serie.updatedAt };
    } catch (err) {
      persistencia = { written: false, error: err instanceof Error ? err.message : String(err), updatedAt: serie.updatedAt };
    }
  }

  return { cac, afa, aca, fxBnaDivisa: bna, persistencia, fetchedAt: new Date().toISOString() };
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

const LABEL: Record<Grano, string> = { soja: "soja", maiz: "maíz", trigo: "trigo" };

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
  const parts = p.granos.map((g) => {
    const unit = g.unidad === "ARS/t" ? "$/t" : "US$/t";
    const v = fmtVar(g);
    return `${LABEL[g.grano]} ${fmtPrecio(g)} ${unit}${v ? ` (${v})` : ""}`;
  });
  return `${head} (${tag}): ${parts.join(" · ")}`;
}
