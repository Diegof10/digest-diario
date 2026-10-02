/**
 * Noticias por RSS (gratis, sin modelo): se bajan feeds de medios agro en español,
 * se quedan los items recientes que son EVENTOS (no precios), se deduplican,
 * se ordenan por relevancia y fecha y se verifica que cada link abra.
 * Módulo sin dependencias de Next/Blob para poder probarlo local.
 */

export interface FeedDef {
  fuente: string;
  url: string;
  /** Feed general (economía): además de un evento, exige contexto agro en el título. */
  general?: boolean;
}

/** Verificados con curl el 02/10/2026: responden 200 y traen items con fecha. */
export const FEEDS: FeedDef[] = [
  { fuente: "Infocampo", url: "https://www.infocampo.com.ar/feed/" },
  { fuente: "Clarín Rural", url: "https://www.clarin.com/rss/rural/" },
  { fuente: "La Nación Campo", url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/campo/?outputType=xml" },
  { fuente: "Agrofy News", url: "https://news.agrofy.com.ar/rss.xml" },
  { fuente: "TodoAgro", url: "https://www.todoagro.com.ar/feed/" },
  { fuente: "Bichos de Campo", url: "https://bichosdecampo.com/feed/" },
  { fuente: "Valor Soja", url: "https://www.valorsoja.com/feed/" },
  { fuente: "Agroverdad", url: "https://www.agroverdad.com.ar/feed" },
  { fuente: "Ámbito", url: "https://www.ambito.com/rss/pages/economia.xml", general: true },
  { fuente: "El Economista", url: "https://www.eleconomista.com.ar/feed/", general: true },
  { fuente: "Clarín", url: "https://www.clarin.com/rss/economia/", general: true },
];

const UA = "Mozilla/5.0 (compatible; ResumenAgrario/1.0; +https://resumen-agrario.vercel.app)";
const TZ = "America/Argentina/Cordoba";

/** Medios que bloquean bots (401/403) pero abren en el navegador. */
const BOT_BLOCK_OK = /(^|\.)(reuters\.com|bloomberg\.com|ft\.com|wsj\.com|lanacion\.com\.ar|clarin\.com|infobae\.com|valor\.globo\.com|agrimoney\.com|farmprogress\.com|dtnpf\.com)$/i;

export function horaArt(d: Date, withDay = true): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    ...(withDay ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d)
    .replace(",", "");
}

export interface RssItem {
  titulo: string;
  url: string;
  fuente: string;
  publicado: Date;
  general: boolean;
}

export interface NoticiaCandidata extends RssItem {
  score: number;
  keywords: string[];
}

// ---------- parseo RSS/Atom (regex, suficiente para feeds de medios) ----------

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
}

/** Saca parámetros de tracking (utm_*) del link. */
function limpiarUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

export function parseFeed(xml: string, feed: FeedDef): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const titulo = decode(tag(b, "title") ?? "");
    let url = decode(tag(b, "link") ?? "");
    if (!url) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      url = m ? m[1].replace(/&amp;/g, "&") : "";
    }
    const fecha = decode(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "");
    const t = Date.parse(fecha);
    if (!titulo || !/^https?:\/\//.test(url) || Number.isNaN(t)) continue;
    url = limpiarUrl(url);
    out.push({ titulo, url, fuente: feed.fuente, publicado: new Date(t), general: !!feed.general });
  }
  return out;
}

async function bajarFeed(feed: FeedDef): Promise<RssItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed);
  } catch {
    return [];
  }
}

// ---------- filtro por eventos ----------

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Palabras clave de EVENTOS (sobre texto sin tildes, en minúscula). */
const EVENTOS: [string, RegExp][] = [
  ["retenciones", /\bretencion(es)?\b|derechos de exportacion|\bdex\b/],
  ["ARCA", /\barca\b/],
  ["gobierno", /\bgobierno\b|\bdecreto\b|\bresolucion\b|boletin oficial|\bministerio\b|secretaria de agricultura|\bmilei\b|\bcaputo\b|\biraeta\b|\bsenasa\b|\bley\b/],
  ["China", /\bchina\b|\bchino(s)?\b/],
  ["conflicto", /\bparo\b|\bhuelga\b|\bgremio\b|aceiter|\bpuerto(s)?\b|\bportuari|\bsoea\b|\burgara\b|\bbloqueo\b/],
  ["clima", /\bsequia\b|inundacion|anegamiento|\bhelada(s)?\b|\bgranizo\b|\bsmn\b|\btormenta(s)?\b|\bnina\b|\bnino\b|\balerta (meteorologica|amarilla|naranja|roja|por)\b|\blluvia(s)?\b|deficit hidrico|ola de calor/],
  ["estimaciones", /\busda\b|\bconab\b|\bbolsa de cereales\b|\bbcr\b|\bbcba\b|bolsa de comercio|\bmillones de toneladas\b|\b(estimacion|proyeccion|produccion|cosecha|siembra|rindes?)\b.*\d|\d.*\b(estimacion|proyeccion|produccion|cosecha|siembra|rindes?|toneladas|hectareas)\b|\brecord\b/],
  ["plagas", /\bplaga(s)?\b|chicharrita|\benfermedad(es)?\b|\blangosta(s)?\b|spiroplasma|\broya\b|\bisoca\b/],
  ["política EE. UU./Brasil", /\bestados unidos\b|\bee\.? ?uu\.?\b|\btrump\b|\baranceles?\b|\bbrasil\b|farm bill/],
  ["exportaciones", /\bexportacion(es)?\b|\bembarques?\b|\bliquidacion\b|\bciara\b/],
];

/** Notas de PRECIOS: se excluyen. */
const PRECIOS = /\bcierre\b|\bcierra\b|\bchicago\b|\bpizarra(s)?\b|\bdolar\b|\bcotizacion|\bcotiza\b|\bprecio(s)?\b|\bmatba\b|\brofex\b|\bfuturos?\b|\bmercado de granos\b|\bhacienda en\b|\bmercado agroganadero\b|\bremates?\b|\b(soja|maiz|trigo|girasol|granos?|cereales)\b.*\b(sube|suben|baja|bajan|subio|bajo|cae|caen|repunta|rebota|se dispara|se desploma)\b|\b(sube|baja|cae|repunta|rebota)\b.*\b(soja|maiz|trigo|girasol|granos?)\b/;
/** Retenciones siempre es evento, aunque el título hable de precios. */
const SIEMPRE_EVENTO = /\bretencion(es)?\b|derechos de exportacion/;

/** Contexto agro exigido a los feeds generales. */
const AGRO = /\bcampo\b|\bagro|\bsoja\b|\bmaiz\b|\btrigo\b|\bgirasol\b|\bgranos?\b|\bcereal|\bcosecha\b|\bproductor(es)?\b|\bganad|\bcarne\b|\bfrigorific|\bretenciones\b|\bderechos de exportacion\b|\baceiter|\bagricultur/;

/** Portugués/inglés: no hay traducción gratis, quedan afuera (la rutina de respaldo las suma). */
function pareceEspanol(t: string): boolean {
  const s = ` ${t.toLowerCase()} `;
  if (/[ãõç]/.test(s) || /\b(não|são|também|safra|para o|do brasil|em\b)/.test(s)) return false;
  if (/\b(the|and|of|to|for|with|on|is|are|says|amid)\b/.test(s) && !/\b(el|la|los|las|de|del|en|por|que)\b/.test(s)) return false;
  return true;
}

export function puntuar(it: RssItem): NoticiaCandidata | null {
  const t = sinTildes(it.titulo);
  if (!pareceEspanol(it.titulo)) return null;
  if (PRECIOS.test(t) && !SIEMPRE_EVENTO.test(t)) return null;
  if (it.general && !AGRO.test(t)) return null;
  const keywords = EVENTOS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (keywords.length === 0) return null;
  return { ...it, score: keywords.length, keywords };
}

// ---------- dedupe ----------

const STOP = new Set("el la los las de del en y a por para con un una que se al lo su sus es mas como sobre tras".split(" "));
function tokens(t: string): Set<string> {
  return new Set(
    sinTildes(t)
      .replace(/[^a-z0-9ñ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );
}
function parecido(a: string, b: string): boolean {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.5;
}

export const normUrl = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

export async function linkAbre(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || u.pathname === "/" || u.pathname === "") return false;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(10000),
    });
    res.body?.cancel().catch(() => {});
    if (res.status < 400) return true;
    return [401, 403, 429].includes(res.status) && BOT_BLOCK_OK.test(u.hostname);
  } catch {
    return false;
  }
}

export interface BusquedaResultado {
  feedsOk: number;
  feedsTotal: number;
  itemsLeidos: number;
  candidatos: number;
  noticias: NoticiaCandidata[];
}

/** Baja feeds, filtra, deduplica, ordena y verifica links. Máx. `max` noticias. */
export async function buscarNoticiasRss(now = new Date(), opts: { horas?: number; max?: number; feeds?: FeedDef[] } = {}): Promise<BusquedaResultado> {
  const horas = opts.horas ?? 36;
  const max = opts.max ?? 5;
  const feeds = opts.feeds ?? FEEDS;
  const listas = await Promise.all(feeds.map(bajarFeed));
  const todos = listas.flat();
  const limite = now.getTime() - horas * 3600_000;
  const futuro = now.getTime() + 2 * 3600_000;

  const cands = todos
    .filter((i) => i.publicado.getTime() >= limite && i.publicado.getTime() <= futuro)
    .map(puntuar)
    .filter((c): c is NoticiaCandidata => !!c)
    .sort((a, b) => b.score - a.score || b.publicado.getTime() - a.publicado.getTime());

  const elegidos: NoticiaCandidata[] = [];
  const urls = new Set<string>();
  for (const c of cands) {
    const k = normUrl(c.url);
    if (urls.has(k) || elegidos.some((e) => parecido(e.titulo, c.titulo))) continue;
    urls.add(k);
    elegidos.push(c);
  }

  // Verificar links en tandas hasta juntar `max`.
  const validos: NoticiaCandidata[] = [];
  for (let i = 0; i < elegidos.length && validos.length < max; i += max) {
    const tanda = elegidos.slice(i, i + max);
    const ok = await Promise.all(tanda.map((c) => linkAbre(c.url)));
    tanda.forEach((c, j) => ok[j] && validos.length < max && validos.push(c));
  }

  return {
    feedsOk: listas.filter((l) => l.length > 0).length,
    feedsTotal: feeds.length,
    itemsLeidos: todos.length,
    candidatos: cands.length,
    noticias: validos,
  };
}
