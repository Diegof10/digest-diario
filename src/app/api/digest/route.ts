import { NextRequest, NextResponse } from "next/server";
import { getCatac } from "@/lib/catac";
import { assembleDigest, DEFAULT_KM } from "@/lib/digest";
import { readHomeBlob } from "@/lib/digest-blob";
import { getFiscal } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

/**
 * Por defecto devuelve el último resumen guardado por el cron.
 * ?fresh=1 lo rearma contra las fuentes (no es el camino de la home).
 */
export async function GET(req: NextRequest) {
  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!fresh) {
    const saved = await readHomeBlob().catch(() => null);
    if (saved?.digest) {
      const [catac, fiscal] = await Promise.all([
        saved.km === km ? Promise.resolve(saved.digest.catac) : getCatac(km),
        getFiscal(),
      ]);
      return NextResponse.json({
        ...saved.digest,
        catac,
        fiscal,
        origen: "blob",
        guardadoAt: saved.savedAt,
      });
    }
  }
  const snap = await assembleDigest({ km, fresh });
  return NextResponse.json({ ...snap, origen: "vivo" });
}
