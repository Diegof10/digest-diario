import { NextRequest, NextResponse } from "next/server";
import { refreshClima } from "@/lib/clima-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron (clima AR/BR/US): diario 06:50 ART = "50 9 * * *" UTC (vercel.json),
 * antes del digest de las 07:00. Pronóstico 7 días Open-Meteo por zona productiva,
 * US Drought Monitor y boletín INMET del mes → Blob `clima/latest.json`. Protegido con CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron/clima] unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const { resumen } = await refreshClima();
    const ms = Date.now() - t0;
    if (!resumen.ok || resumen.blobError) {
      console.error(`[cron/clima] FAIL ${ms}ms ${JSON.stringify(resumen)}`);
      return NextResponse.json({ ...resumen, ok: false, ms }, { status: 500 });
    }
    console.log(`[cron/clima] ok ${ms}ms ${JSON.stringify(resumen)}`);
    return NextResponse.json({ ...resumen, ok: true, ms });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(`[cron/clima] FAIL ${Date.now() - t0}ms ${m}`);
    return NextResponse.json({ ok: false, error: m }, { status: 500 });
  }
}
