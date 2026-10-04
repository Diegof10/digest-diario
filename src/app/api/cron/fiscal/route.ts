import { NextRequest, NextResponse } from "next/server";
import { refreshFiscal } from "@/lib/fiscal-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Vercel Cron (fiscal): lun–vie 08:00 ART = "0 11 * * 1-5" UTC (vercel.json).
 * Revisa BO primera sección (RG ARCA, decretos, resoluciones agro/fiscal) y ARCA SISA,
 * y guarda el resultado en Blob `fiscal/latest.json`. Protegido con CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron/fiscal] unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const { resumen } = await refreshFiscal();
    const ms = Date.now() - t0;
    if (!resumen.ok || resumen.blobError) {
      console.error(`[cron/fiscal] FAIL ${ms}ms ${JSON.stringify(resumen)}`);
      return NextResponse.json({ ...resumen, ok: false, ms }, { status: 500 });
    }
    console.log(`[cron/fiscal] ok ${ms}ms ${JSON.stringify(resumen)}`);
    return NextResponse.json({ ...resumen, ok: true, ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron/fiscal] FAIL ${Date.now() - t0}ms ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
