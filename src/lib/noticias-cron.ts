import { get, put } from "@vercel/blob";
import { getVercelOidcToken } from "@vercel/oidc";
import type { NoticiasFile, NoticiasItem } from "@/lib/noticias";

/**
 * Noticias automáticas (cron Vercel 6:38 y 17:43 ART).
 * Modelo con búsqueda web vía Vercel AI Gateway → candidatos → se abre cada link y
 * sólo entran los que cargan → máx. 5 → Blob `noticias/latest.json`.
 * Formato fijo: título en español, fuente, hora, link. Sin resumen.
 * Si no hay ninguna noticia nueva respecto de la tanda anterior: se conservan las
 * anteriores y se marca aviso "Sin noticias nuevas · HH:MM".
 */

const PATHNAME = "noticias/latest.json";
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = process.env.NOTICIAS_MODEL || "perplexity/sonar-pro";
const TZ = "America/Argentina/Cordoba";

/** Medios que bloquean bots (401/403) pero abren en el navegador. */
const BOT_BLOCK_OK = /(^|\.)(reuters\.com|bloomberg\.com|ft\.com|wsj\.com|lanacion\.com\.ar|clarin\.com|infobae\.com|valor\.globo\.com|agrimoney\.com|farmprogress\.com|dtnpf\.com)$/i;

export type NoticiasBlobFile = NoticiasFile & { aviso?: string | null };

function horaArt(d: Date, withDay = true): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    ...(withDay ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", "");
}

async function token(): Promise<string> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  return await getVercelOidcToken();
}

export async function readNoticiasBlob(): Promise<NoticiasBlobFile | null> {
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(PATHNAME, { access, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as NoticiasBlobFile;
    } catch {
      /* probar el otro modo */
    }
  }
  return null;
}

async function writeNoticiasBlob(file: NoticiasBlobFile): Promise<void> {
  const body = JSON.stringify(file, null, 2);
  let lastErr: unknown = null;
  for (const access of ["private", "public"] as const) {
    try {
      await put(PATHNAME, body, {
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

const PROMPT = (hoy: string) => `Hoy es ${hoy} (hora Argentina). Buscá en la web noticias publicadas en las últimas 36 horas, en español, inglés o portugués, que sean EVENTOS que mueven la decisión de un productor de granos argentino (soja, maíz, trigo, girasol):
retenciones o derechos de exportación, medidas del gobierno o de ARCA, compras de China, paros en puertos o aceiteras, clima extremo, informes USDA/CONAB/bolsas con cifras de producción, plagas, cambios de política agrícola en EE. UU. o Brasil.
EXCLUÍ noticias de precios (cierres de Chicago, pizarras, futuros, dólar, "subió/bajó la soja").
Devolvé SOLO un JSON (sin texto antes ni después) con esta forma:
{"items":[{"titulo_es":"título en español, una línea, sin resumen","fuente":"nombre del medio u organismo","url":"link directo a la nota (no a la portada)","publicado":"fecha y hora ISO 8601 con zona"}]}
Hasta 8 items, ordenados por impacto en la caja del productor. Si el título original no está en español, traducilo. Usá solo URLs que hayas visto en la búsqueda.`;

interface Candidato {
  titulo_es?: string;
  fuente?: string;
  url?: string;
  publicado?: string;
}

async function pedirCandidatos(now: Date): Promise<Candidato[]> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPT(horaArt(now)) }],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("respuesta sin JSON");
  const parsed = JSON.parse(m[0]) as { items?: Candidato[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function linkAbre(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || u.pathname === "/" || u.pathname === "") return false;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ResumenAgrario/1.0)", Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(10000),
    });
    res.body?.cancel().catch(() => {});
    if (res.status < 400) return true;
    return [401, 403, 429].includes(res.status) && BOT_BLOCK_OK.test(u.hostname);
  } catch {
    return false;
  }
}

const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

export async function refreshNoticias(now = new Date()) {
  const prev = await readNoticiasBlob();
  const prevUrls = new Set((prev?.items ?? []).map((i) => (i.url ? norm(i.url) : "")));
  const cands = await pedirCandidatos(now);
  const limite = now.getTime() - 48 * 3600_000;

  const vistos = new Set<string>();
  const filtrados = cands.filter((c) => {
    if (!c.url || !c.titulo_es?.trim()) return false;
    const k = norm(c.url);
    if (vistos.has(k)) return false;
    vistos.add(k);
    const t = c.publicado ? Date.parse(c.publicado) : NaN;
    return Number.isNaN(t) || t >= limite;
  });
  const abiertos = await Promise.all(filtrados.map(async (c) => ((await linkAbre(c.url!)) ? c : null)));
  const validos = abiertos.filter((c): c is Candidato => !!c).slice(0, 5);

  const items: NoticiasItem[] = validos.map((c) => {
    const t = c.publicado ? new Date(c.publicado) : null;
    const ok = t && !Number.isNaN(t.getTime());
    return {
      title: c.titulo_es!.trim(),
      source: (c.fuente || new URL(c.url!).hostname.replace(/^www\./, "")).trim(),
      handle: (c.fuente || "").trim(),
      text: c.titulo_es!.trim(),
      url: c.url!,
      publishedAt: ok ? t!.toISOString() : null,
      publishedAtArg: ok ? horaArt(t!) : null,
    };
  });

  const nuevas = items.filter((i) => !prevUrls.has(norm(i.url!)));
  const base = {
    asOf: now.toISOString(),
    asOfArg: horaArt(now),
    maxAgeHours: 48,
    valor: null,
    updatedAt: now.toISOString(),
    updatedBy: "cron",
  };

  let file: NoticiasBlobFile;
  if (nuevas.length === 0) {
    file = {
      ...base,
      items: prev?.items ?? [],
      valor: prev?.items?.length ? null : `Sin noticias nuevas · ${horaArt(now, false)}`,
      aviso: `Sin noticias nuevas · ${horaArt(now, false)}`,
    };
  } else {
    file = { ...base, items, aviso: null };
  }
  await writeNoticiasBlob(file);
  return {
    candidatos: cands.length,
    conLinkValido: items.length,
    nuevas: nuevas.length,
    descartados: cands.length - items.length,
    aviso: file.aviso ?? null,
  };
}

const RUN_PATH = "noticias/last-run.json";

export type NoticiasRunStatus = { at: string; ok: boolean; ms: number; error?: string; resumen?: unknown };

export async function writeNoticiasRun(s: NoticiasRunStatus): Promise<void> {
  const body = JSON.stringify({ ...s, error: s.error?.slice(0, 300) });
  for (const access of ["private", "public"] as const) {
    try {
      await put(RUN_PATH, body, { access, addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
      return;
    } catch {
      /* probar el otro modo */
    }
  }
}

export async function readNoticiasRun(): Promise<NoticiasRunStatus | null> {
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(RUN_PATH, { access, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as NoticiasRunStatus;
    } catch {
      /* probar el otro modo */
    }
  }
  return null;
}
