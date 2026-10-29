import { get, put } from "@vercel/blob";
import type { LecturaCard } from "@/lib/lectura-cards";
import type { ClimaVivoSnapshot } from "@/lib/clima-vivo";
import type { HaciendaSnapshot } from "@/lib/hacienda";
import { blobConfigured } from "@/lib/serie-blob";
import type { DigestSnapshot } from "@/lib/types";

/**
 * Último resumen armado por el cron. La home y /api/digest lo leen
 * y no vuelven a pegarle a las fuentes en cada visita.
 */
export const DIGEST_BLOB_PATH = "digest/latest.json";

export interface HomeBlobFile {
  savedAt: string;
  km: number;
  digest: DigestSnapshot;
  climaVivo: ClimaVivoSnapshot;
  hacienda: HaciendaSnapshot;
  lecturaCards: LecturaCard[];
}

type Access = "private" | "public";

let memo: { at: number; file: HomeBlobFile | null } | null = null;

export async function readHomeBlob(force = false): Promise<HomeBlobFile | null> {
  if (!blobConfigured()) return null;
  if (!force && memo && Date.now() - memo.at < 30_000) return memo.file;
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(DIGEST_BLOB_PATH, { access, useCache: false });
      if (!res || res.statusCode !== 200) {
        memo = { at: Date.now(), file: null };
        return null;
      }
      const file = JSON.parse(await new Response(res.stream).text()) as HomeBlobFile;
      if (!file?.digest || !file.savedAt) return null;
      memo = { at: Date.now(), file };
      return file;
    } catch {
      /* el otro modo de acceso */
    }
  }
  return null;
}

export async function writeHomeBlob(
  file: HomeBlobFile,
): Promise<{ written: boolean; error: string | null }> {
  if (!blobConfigured()) return { written: false, error: "blob no configurado" };
  const body = JSON.stringify(file);
  let last: string | null = null;
  for (const access of ["private", "public"] as Access[]) {
    try {
      await put(DIGEST_BLOB_PATH, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      memo = { at: Date.now(), file };
      return { written: true, error: null };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  return { written: false, error: last };
}
