import { get, put } from "@vercel/blob";
import type { NoticiasFile, NoticiasItem } from "@/lib/noticias";
import { buscarNoticiasRss, horaArt, normUrl as norm } from "@/lib/noticias-rss";

/**
 * Noticias automáticas (cron Vercel 6:38 y 17:43 ART).
 * Feeds RSS de medios agro en español → items de las últimas 36 h → filtro de EVENTOS
 * (sin notas de precios) → dedupe → orden por relevancia y fecha → se abre cada link
 * y sólo entran los que cargan → máx. 5 → Blob `noticias/latest.json`.
 * Formato fijo: título, fuente, hora, link. Sin resumen.
 * Si no hay ninguna noticia nueva respecto de la tanda anterior: se conservan las
 * anteriores y se marca aviso "Sin noticias nuevas · HH:MM".
 */

const PATHNAME = "noticias/latest.json";

export type NoticiasBlobFile = NoticiasFile & { aviso?: string | null };

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

export async function refreshNoticias(now = new Date()) {
  const prev = await readNoticiasBlob();
  const prevUrls = new Set((prev?.items ?? []).map((i) => (i.url ? norm(i.url) : "")));
  const busqueda = await buscarNoticiasRss(now, { horas: 36, max: 5 });
  if (busqueda.feedsOk === 0) throw new Error(`ningún feed respondió (${busqueda.feedsTotal} probados)`);

  const items: NoticiasItem[] = busqueda.noticias.map((c) => ({
    title: c.titulo,
    source: c.fuente,
    handle: c.fuente,
    text: c.titulo,
    url: c.url,
    publishedAt: c.publicado.toISOString(),
    publishedAtArg: horaArt(c.publicado),
    relevance: c.score,
  }));

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
    fuente: "rss",
    feedsOk: `${busqueda.feedsOk}/${busqueda.feedsTotal}`,
    itemsLeidos: busqueda.itemsLeidos,
    candidatos: busqueda.candidatos,
    conLinkValido: items.length,
    nuevas: nuevas.length,
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
