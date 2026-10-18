import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getClimaVivo } from "@/lib/clima-vivo";
import { assembleDigest } from "@/lib/digest";
import { hoyArtIso } from "@/lib/habiles";
import { getHacienda } from "@/lib/hacienda";
import { buildLecturaCards } from "@/lib/lectura-cards";
import { loadResumenMatutino } from "@/lib/resumen-matutino";

/**
 * Datos de la home con cache de 10 min (Vercel Data Cache, stale-while-revalidate).
 * - La página ya no consulta las fuentes externas en cada visita: sirve el último
 *   armado y lo refresca en segundo plano cuando venció.
 * - La clave incluye el día ART, así un armado de ayer nunca se muestra como de hoy.
 * - Cada dato conserva su propia fecha/hora real (fecha de pizarra, leidoAt, etc.).
 * - Sin escrituras a Blob: la serie la persiste sólo /api/cron/digest (fresh).
 */
export const HOME_REVALIDATE_S = 600;

async function armarHome(km: number, conCos: boolean) {
  const [digest, climaVivo, cos, hacienda] = await Promise.all([
    assembleDigest({ km }),
    getClimaVivo(),
    conCos ? loadResumenMatutino() : Promise.resolve(null),
    getHacienda(),
  ]);
  const lecturaCards = await buildLecturaCards(digest.mercado, digest.fiscal, climaVivo);
  return { digest, climaVivo, cos, hacienda, lecturaCards };
}

export type HomeData = Awaited<ReturnType<typeof armarHome>>;

const armarHomeCached = unstable_cache(
  // `dia` sólo forma parte de la clave de cache (corte diario ART).
  async (km: number, conCos: boolean, dia: string) => {
    void dia;
    return armarHome(km, conCos);
  },
  ["home-data-v1"],
  { revalidate: HOME_REVALIDATE_S, tags: ["home-data"] },
);

/** Deduplicado por request (Ticker y cuerpo comparten la misma promesa). */
export const getHomeData = cache(
  (km: number, conCos: boolean): Promise<HomeData> => armarHomeCached(km, conCos, hoyArtIso()),
);
