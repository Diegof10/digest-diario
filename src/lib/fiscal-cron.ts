import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { hoyArtIso } from "@/lib/habiles";
import { blobConfigured } from "@/lib/serie-blob";

/**
 * Fiscal automático (cron Vercel lun–vie 08:00 ART, ver vercel.json).
 *
 * 1. Boletín Oficial, primera sección, últimas ediciones (ventana NOVEDAD_DIAS):
 *    rubros Resolución general (63), Decretos (24), Resoluciones (1715) y
 *    Resolución conjunta (5001) vía el endpoint público /seccion/buscarRubro
 *    (el listado /seccion/primera corta en 100 avisos y pagina por sesión).
 * 2. Filtro: organismo ARCA/AFIP, Economía, Agricultura o Poder Ejecutivo +
 *    palabras clave agro/fiscal (SISA, granos, derechos de exportación, Ganancias,
 *    IVA, Bienes Personales, monotributo…). Para las RG de ARCA se lee el título
 *    completo del aviso (el listado lo trunca).
 * 3. ARCA SISA "Información productiva": huella del texto; si cambia se avisa.
 * 4. Resultado → Blob `fiscal/latest.json`. Si una fuente falla se conservan los
 *    datos anteriores y se registra el error (nunca se inventan normas).
 *
 * Los vencimientos y las "normas vigentes" curadas siguen en src/data/fiscal-snapshot.json.
 */

export const FISCAL_BLOB_PATH = "fiscal/latest.json";
const BO = "https://www.boletinoficial.gob.ar";
const SISA_URL =
  "https://www.arca.gob.ar/actividadesAgropecuarias/sector-agro/sisa/informacion-productiva.asp";
const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Ventana de búsqueda en BO (días corridos hacia atrás, incluye hoy). */
export const VENTANA_DIAS = 7;
/** Cuánto se conservan en Blob los ítems detectados. */
const RETENER_DIAS = 30;

const RUBROS: Array<{ id: string; nombre: string }> = [
  { id: "63", nombre: "Resolución general" },
  { id: "24", nombre: "Decreto" },
  { id: "1715", nombre: "Resolución" },
  { id: "5001", nombre: "Resolución conjunta" },
];

export interface FiscalBoItem {
  /** "RG ARCA 5907/2026", "Decreto 123/2026", "Resolución 400/2026 (Economía)" */
  norma: string;
  organismo: string;
  /** Síntesis oficial del BO (sin el código GDE) */
  titulo: string;
  /** yyyy-mm-dd */
  boFecha: string;
  url: string;
  rubro: string;
  /** palabras clave que matchearon */
  temas: string[];
}

export interface FiscalBlobFile {
  /** Última revisión exitosa (ISO). Es la fecha que muestra el panel. */
  revisadoAt: string | null;
  /** Ediciones del BO revisadas OK en la última corrida (yyyy-mm-dd) */
  ediciones: string[];
  items: FiscalBoItem[];
  sisa: { hash: string | null; checkedAt: string | null; cambioAt: string | null } | null;
  ultimaCorrida: { at: string; ok: boolean; ms: number; errores: string[]; nuevos: number; consultas: string } | null;
}

/* ------------------------------ Filtro ------------------------------ */

const TEMAS: Array<[string, RegExp]> = [
  ["SISA", /\bSISA\b|Sistema de Informaci[oó]n Simplificado Agr[ií]cola/i],
  ["granos", /\bgranos?\b|cereal|oleaginos|\bsoja\b|ma[ií]z|\btrigo\b|girasol|\bsorgo\b|cebada|legumbre|semilla/i],
  ["retenciones", /derechos? de exportaci[oó]n|retenciones|\bDEX\b/i],
  ["agro", /agropecuari|\bagro\b|agr[ií]cola|ganader|hacienda|bovino|carne|productor(es)? rural|lech|forestal|Registro Fiscal de Operadores|\bRFOG\b|carta de porte|\bLPG\b|liquidaci[oó]n primaria/i],
  ["Ganancias", /ganancias/i],
  ["IVA", /\bIVA\b|valor agregado/i],
  ["Bienes Personales", /bienes personales/i],
  ["monotributo", /monotribut|r[eé]gimen simplificado/i],
  ["anticipos", /anticipos?\b/i],
  ["vencimientos", /vencimiento|calendario/i],
  ["percepciones", /percepci[oó]n|retenci[oó]n/i],
];

/** Temas "agro/fiscal núcleo": alcanza con uno. Los genéricos (vencimientos, percepciones) sólo suman en ARCA. */
const NUCLEO = new Set(["SISA", "granos", "retenciones", "agro", "Ganancias", "IVA", "Bienes Personales", "monotributo", "anticipos"]);

const ORG_ARCA = /RECAUDACI[OÓ]N Y CONTROL ADUANERO|\bARCA\b|\bAFIP\b|INGRESOS P[UÚ]BLICOS/i;
const ORG_RELEVANTE = /ECONOM[IÍ]A|AGRICULTURA|GANADER|PODER EJECUTIVO|JEFATURA DE GABINETE|ARCA|RECAUDACI[OÓ]N/i;
/** Dependencias de Aduana/locales de ARCA: suelen ser actos internos. */
const ORG_ARCA_INTERNO = /ADUANA |SUBDIRECCI[OÓ]N GENERAL DE OPERACIONES ADUANERAS|DIRECCI[OÓ]N REGIONAL|DEPARTAMENTO|RECURSOS HUMANOS/i;

export function temasDe(texto: string): string[] {
  return TEMAS.filter(([, re]) => re.test(texto)).map(([t]) => t);
}

export function esRelevante(it: { organismo: string; rubro: string; titulo: string; norma: string }): string[] | null {
  const texto = `${it.norma} ${it.titulo}`;
  const temas = temasDe(texto);
  const nucleo = temas.filter((t) => NUCLEO.has(t));
  const esArca = ORG_ARCA.test(it.organismo);
  if (esArca && ORG_ARCA_INTERNO.test(it.organismo)) {
    // Aduanas locales / subdirecciones: sólo si hablan de granos/retenciones/SISA explícitamente.
    return temas.some((t) => t === "SISA" || t === "granos" || t === "retenciones") ? temas : null;
  }
  if (esArca && it.rubro === "Resolución general") return temas.length > 0 ? temas : null;
  if (it.rubro === "Decreto") return nucleo.length > 0 ? temas : null;
  if (ORG_RELEVANTE.test(it.organismo)) return nucleo.length > 0 ? temas : null;
  return null;
}

/* ------------------------------ Parseo BO ------------------------------ */

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n: string) => {
      const map: Record<string, string> = {
        aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
        Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
        deg: "°", ordm: "º", ordf: "ª",
      };
      return map[n] ?? m;
    });
}

function texto(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Quita el código GDE inicial ("RESOG-2026-5907-E-ARCA-ARCA - ") de la síntesis. */
function sinCodigo(s: string): string {
  return s.replace(/^[A-Z]{2,8}-\d{4}-[\w#-]+\s*-\s*/, "").trim();
}

function normaCorta(organismo: string, norma: string): string {
  const n = norma.replace(/\s+/g, " ").trim();
  if (ORG_ARCA.test(organismo)) {
    if (/^Resoluci[oó]n General/i.test(n)) return n.replace(/^Resoluci[oó]n General/i, "RG ARCA");
    return `${n} (ARCA)`;
  }
  if (/PODER EJECUTIVO/i.test(organismo) || /^Decreto/i.test(n)) return n;
  const corto = /AGRICULTURA/i.test(organismo) ? "Agricultura" : /ECONOM/i.test(organismo) ? "Economía" : organismo.split(" - ")[0].toLowerCase();
  return `${n} (${corto})`;
}

/** Parsea el HTML de un rubro (respuesta de /seccion/buscarRubro o de /seccion/primera). */
export function parseListadoBo(html: string, rubro: string, fechaIso: string): Omit<FiscalBoItem, "temas">[] {
  const out: Omit<FiscalBoItem, "temas">[] = [];
  const re = /<a[^>]+href="(\/detalleAviso\/primera\/(\d+)\/(\d{8}))"[^>]*>([\s\S]*?)<\/a>/g;
  const vistos = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = m[4];
    const org = inner.match(/class="item">([\s\S]*?)<\/p>/);
    if (!org) continue; // link de "anexos"
    const smalls = [...inner.matchAll(/<small>([\s\S]*?)<\/small>/g)].map((x) => texto(x[1]));
    const url = `${BO}${m[1]}`;
    if (vistos.has(url)) continue;
    vistos.add(url);
    const d = m[3];
    const organismo = texto(org[1]);
    const norma = smalls[0] ?? "";
    out.push({
      norma: normaCorta(organismo, norma),
      organismo,
      titulo: sinCodigo(smalls[1] ?? ""),
      boFecha: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : fechaIso,
      url,
      rubro,
    });
  }
  return out;
}

/* ------------------------------ Fetch ------------------------------ */

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

async function buscarRubro(f: Fetch, fecha8: string, idRubro: string): Promise<string> {
  const params = {
    numeroPagina: 1,
    fechaPublicacion: fecha8,
    idRubro,
    seccion: [1],
    ultimoRubro: "",
    hayMasResultadosBusqueda: true,
    ejecutandoLlamadaAsincronicaBusqueda: false,
    filtroPorRubrosSeccion: true,
    filtroPorRubroBusqueda: false,
    filtroPorSeccionBusqueda: false,
    busquedaOriginal: false,
  };
  const body = new URLSearchParams({ params: JSON.stringify(params), array_volver: "[]" });
  return conTimeout(25_000, async (signal) => {
    const res = await f(`${BO}/seccion/buscarRubro`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body,
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { error?: number; content?: { html?: string } };
    if (j.error && j.error !== 0) throw new Error(`BO error ${j.error}`);
    return j.content?.html ?? "";
  });
}

/** Título completo del aviso (el listado lo corta en ~150 caracteres). */
async function tituloCompleto(f: Fetch, url: string): Promise<string | null> {
  try {
    const html = await conTimeout(20_000, async (signal) => {
      const res = await f(url, { headers: { "User-Agent": UA }, signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    // <div id="tituloDetalleAviso"><h1>organismo</h1><h2>norma</h2><h6>CODIGO - síntesis</h6></div>
    const bloque = html.match(/id="tituloDetalleAviso"([\s\S]*?)id="cuerpoDetalleAviso"/)?.[1] ?? "";
    const lineas = [...bloque.matchAll(/<(h\d|p)[^>]*>([\s\S]*?)<\/\1>/g)].map((x) => texto(x[2])).filter(Boolean);
    const sint = lineas.find((l) => /^[A-Z]{2,8}-\d{4}-/.test(l));
    return sint ? sinCodigo(sint) : null;
  } catch {
    return null;
  }
}

async function enLotes<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await fn(xs[k]);
      }
    }),
  );
  return out;
}

function isoMenos(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

/** Días hábiles (lun–vie) de la ventana, del más nuevo al más viejo. */
export function edicionesVentana(hoy: string, dias = VENTANA_DIAS): string[] {
  const out: string[] = [];
  for (let k = 0; k < dias; k++) {
    const iso = isoMenos(hoy, k);
    const [y, m, d] = iso.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(iso);
  }
  return out;
}

export interface EscaneoBo {
  items: FiscalBoItem[];
  edicionesOk: string[];
  avisosLeidos: number;
  consultasOk: number;
  consultasTotal: number;
  errores: string[];
}

export async function escanearBoletin(
  opts: { hoy?: string; dias?: number; fetchImpl?: Fetch } = {},
): Promise<EscaneoBo> {
  const f = opts.fetchImpl ?? fetch;
  const hoy = opts.hoy ?? hoyArtIso();
  const fechas = edicionesVentana(hoy, opts.dias ?? VENTANA_DIAS);
  const tareas = fechas.flatMap((fecha) => RUBROS.map((r) => ({ fecha, r })));
  const errores: string[] = [];
  const okPorFecha = new Map<string, number>();
  const res = await enLotes(tareas, 4, async ({ fecha, r }) => {
    try {
      // El BO a veces responde {error:1} o corta: un reintento.
      const html = await buscarRubro(f, fecha.replace(/-/g, ""), r.id).catch(async () => {
        await new Promise((ok) => setTimeout(ok, 1500));
        return buscarRubro(f, fecha.replace(/-/g, ""), r.id);
      });
      okPorFecha.set(fecha, (okPorFecha.get(fecha) ?? 0) + 1);
      return parseListadoBo(html, r.nombre, fecha);
    } catch (e) {
      errores.push(`BO ${fecha} ${r.nombre}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });
  const leidos = res.flatMap((x) => x ?? []);
  const candidatos: FiscalBoItem[] = [];
  for (const it of leidos) {
    let titulo = it.titulo;
    // RG de ARCA: el listado trunca la síntesis → leer el título completo.
    if (ORG_ARCA.test(it.organismo) && it.rubro === "Resolución general" && /\.\.\.$|…$/.test(titulo)) {
      titulo = (await tituloCompleto(f, it.url)) ?? titulo.replace(/\.\.\.$/, "…");
    }
    const temas = esRelevante({ ...it, titulo });
    if (temas) candidatos.push({ ...it, titulo, temas });
  }
  candidatos.sort((a, b) => b.boFecha.localeCompare(a.boFecha) || a.norma.localeCompare(b.norma));
  return {
    items: candidatos,
    edicionesOk: fechas.filter((d) => (okPorFecha.get(d) ?? 0) === RUBROS.length),
    avisosLeidos: leidos.length,
    consultasOk: tareas.length - errores.length,
    consultasTotal: tareas.length,
    errores,
  };
}

/** Huella del texto principal de ARCA SISA "Información productiva". */
export async function huellaSisa(fetchImpl: Fetch = fetch): Promise<string> {
  const html = await conTimeout(20_000, async (signal) => {
    const res = await fetchImpl(SISA_URL, { headers: { "User-Agent": UA }, signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
  const t = texto(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ""));
  const i = t.indexOf("Módulo información productiva");
  const cuerpo = i >= 0 ? t.slice(i) : t;
  return createHash("sha256").update(cuerpo).digest("hex").slice(0, 16);
}

/* ------------------------------ Blob ------------------------------ */

export async function readFiscalBlob(): Promise<FiscalBlobFile | null> {
  if (!blobConfigured()) return null;
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(FISCAL_BLOB_PATH, { access, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as FiscalBlobFile;
    } catch {
      /* probar el otro modo */
    }
  }
  return null;
}

async function writeFiscalBlob(file: FiscalBlobFile): Promise<void> {
  const body = JSON.stringify(file, null, 2);
  let lastErr: unknown = null;
  for (const access of ["private", "public"] as const) {
    try {
      await put(FISCAL_BLOB_PATH, body, {
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

/**
 * Corre la revisión y arma el archivo nuevo. `persist=false` (pruebas locales) no escribe en Blob.
 * Fallas parciales: se conservan los ítems anteriores de las ediciones que no se pudieron leer.
 * Falla total del BO: se conserva todo y `revisadoAt` no avanza.
 */
export async function refreshFiscal(
  opts: { now?: Date; persist?: boolean; fetchImpl?: Fetch; prev?: FiscalBlobFile | null } = {},
) {
  const now = opts.now ?? new Date();
  const t0 = Date.now();
  const hoy = hoyArtIso(now);
  const prev = opts.prev !== undefined ? opts.prev : await readFiscalBlob().catch(() => null);
  const [bo, sisa] = await Promise.all([
    escanearBoletin({ hoy, fetchImpl: opts.fetchImpl }),
    huellaSisa(opts.fetchImpl).then(
      (h) => ({ h, err: null as string | null }),
      (e) => ({ h: null as string | null, err: `ARCA SISA: ${e instanceof Error ? e.message : String(e)}` }),
    ),
  ]);
  const errores = [...bo.errores, ...(sisa.err ? [sisa.err] : [])];
  const boOk = bo.consultasOk > 0;

  // Merge: ítems nuevos + anteriores de ediciones no revisadas OK, dentro de RETENER_DIAS.
  const desde = isoMenos(hoy, RETENER_DIAS);
  const okSet = new Set(bo.edicionesOk);
  const prevItems = (prev?.items ?? []).filter((i) => i.boFecha >= desde && (!boOk || !okSet.has(i.boFecha)));
  const porUrl = new Map<string, FiscalBoItem>();
  for (const i of [...bo.items, ...prevItems]) if (!porUrl.has(i.url)) porUrl.set(i.url, i);
  const items = [...porUrl.values()].sort((a, b) => b.boFecha.localeCompare(a.boFecha));
  const prevUrls = new Set((prev?.items ?? []).map((i) => i.url));
  const nuevos = bo.items.filter((i) => !prevUrls.has(i.url)).length;

  const prevSisa = prev?.sisa ?? null;
  const sisaOut = sisa.h
    ? {
        hash: sisa.h,
        checkedAt: now.toISOString(),
        cambioAt: prevSisa?.hash && prevSisa.hash !== sisa.h ? now.toISOString() : (prevSisa?.cambioAt ?? null),
      }
    : prevSisa;

  const file: FiscalBlobFile = {
    revisadoAt: boOk ? now.toISOString() : (prev?.revisadoAt ?? null),
    ediciones: boOk ? bo.edicionesOk : (prev?.ediciones ?? []),
    items,
    sisa: sisaOut,
    ultimaCorrida: {
      at: now.toISOString(),
      ok: boOk && errores.length === 0,
      ms: Date.now() - t0,
      errores: errores.slice(0, 10).map((e) => e.slice(0, 200)),
      nuevos,
      consultas: `${bo.consultasOk}/${bo.consultasTotal}`,
    },
  };

  let blobWritten = false;
  let blobError: string | null = null;
  if (opts.persist !== false) {
    if (!blobConfigured()) blobError = "blob no configurado";
    else {
      try {
        await writeFiscalBlob(file);
        blobWritten = true;
      } catch (e) {
        blobError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  return {
    file,
    resumen: {
      ok: boOk,
      ediciones: bo.edicionesOk,
      avisosLeidos: bo.avisosLeidos,
      relevantes: bo.items.length,
      nuevos,
      consultas: `${bo.consultasOk}/${bo.consultasTotal}`,
      sisaCambio: Boolean(sisaOut?.cambioAt && sisaOut.cambioAt === now.toISOString()),
      errores,
      blobWritten,
      blobError,
    },
  };
}
