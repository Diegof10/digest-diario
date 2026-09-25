import { NextRequest, NextResponse } from "next/server";
import { assembleDigest, DEFAULT_KM } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron (ver vercel.json): 07:00 ART diario + 11:15 y 18:30 ART lun–vie.
 * Refresca todas las fuentes sin cache (feed granos, CAC, AFA, MAGYP FOB, BNA, WTI,
 * clima, noticias) y persiste la serie de cierres en Vercel Blob.
 * Protegido con CRON_SECRET: Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      console.warn("[cron/digest] unauthorized");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;

  const started = Date.now();
  const snap = await assembleDigest({ km, fresh: true });
  const p = snap.mercado.plazas;
  const resumen = p
    ? Object.fromEntries(
        (["cac", "afa", "fob"] as const).map((k) => [
          k,
          { fecha: p[k].fecha, frescura: p[k].frescura, granos: p[k].granos.length, error: p[k].error },
        ]),
      )
    : null;
  console.log(
    `[cron/digest] ok ${Date.now() - started}ms plazas=${JSON.stringify(resumen)} blob=${JSON.stringify(p?.persistencia ?? null)}`,
  );
  return NextResponse.json({
    ok: true,
    cron: true,
    ranAt: new Date().toISOString(),
    plazas: resumen,
    persistencia: p?.persistencia ?? null,
    digest: snap,
  });
}
