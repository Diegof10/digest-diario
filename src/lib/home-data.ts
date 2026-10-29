import { cache } from "react";
import { getCatac } from "@/lib/catac";
import { getClimaVivo } from "@/lib/clima-vivo";
import { assembleDigest } from "@/lib/digest";
import { readHomeBlob, writeHomeBlob, type HomeBlobFile } from "@/lib/digest-blob";
import { getFiscal } from "@/lib/fiscal";
import { getHacienda } from "@/lib/hacienda";
import { buildLecturaCards } from "@/lib/lectura-cards";
import { loadResumenMatutino } from "@/lib/resumen-matutino";

/**
 * La home lee el último resumen que guardó el cron (Blob `digest/latest.json`).
 * No consulta Chicago, BCRA, pizarras ni el resto de las fuentes en cada visita.
 * Si todavía no hay blob (local, o el cron no corrió), arma en vivo una vez.
 */

async function armarHome(km: number, conCos: boolean, fresh = false) {
  const [digest, climaVivo, cos, hacienda] = await Promise.all([
    assembleDigest({ km, fresh }),
    getClimaVivo(),
    conCos || fresh ? loadResumenMatutino() : Promise.resolve(null),
    getHacienda(),
  ]);
  const lecturaCards = await buildLecturaCards(digest.mercado, digest.fiscal, climaVivo);
  return { digest, climaVivo, cos, hacienda, lecturaCards };
}

export type HomeData = Awaited<ReturnType<typeof armarHome>> & {
  origen: "blob" | "vivo";
};

function fileDe(data: Awaited<ReturnType<typeof armarHome>>, km: number): HomeBlobFile {
  return {
    savedAt: new Date().toISOString(),
    km,
    digest: data.digest,
    climaVivo: data.climaVivo,
    hacienda: data.hacienda,
    lecturaCards: data.lecturaCards,
  };
}

/** Lo usa el cron: arma fresco y deja el resumen en Blob para las visitas. */
export async function captureHome(km: number) {
  const data = await armarHome(km, true, true);
  const file = fileDe(data, km);
  const blob = await writeHomeBlob(file);
  return { data, blob, file };
}

async function desdeBlob(saved: HomeBlobFile, km: number, conCos: boolean): Promise<HomeData> {
  // El fiscal vive en su propio blob (otro cron). Releerlo no pega al Boletín:
  // así un ok:false de las 08:00 se ve aunque el resumen sea el de las 07:00.
  const [catac, fiscal] = await Promise.all([
    saved.km === km ? Promise.resolve(saved.digest.catac) : getCatac(km),
    getFiscal(),
  ]);
  const digest = { ...saved.digest, catac, fiscal };
  const [cos, lecturaCards] = await Promise.all([
    conCos ? loadResumenMatutino() : Promise.resolve(null),
    buildLecturaCards(digest.mercado, fiscal, saved.climaVivo),
  ]);
  return {
    digest,
    climaVivo: saved.climaVivo,
    cos,
    hacienda: saved.hacienda,
    lecturaCards,
    origen: "blob",
  };
}

/** Deduplicado por request (la cinta y el cuerpo comparten la misma promesa). */
export const getHomeData = cache(async (km: number, conCos: boolean): Promise<HomeData> => {
  const saved = await readHomeBlob().catch(() => null);
  if (saved?.digest) return desdeBlob(saved, km, conCos);
  const live = await armarHome(km, conCos, false);
  return { ...live, origen: "vivo" };
});
