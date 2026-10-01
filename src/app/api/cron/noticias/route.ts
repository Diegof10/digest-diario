import { NextRequest, NextResponse } from "next/server";
import { refreshNoticias } from "@/lib/noticias-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Vercel Cron: 6:38 ART diario y 17:43 ART lun–vie (vercel.json). Protegido con CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron/noticias] unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const r = await refreshNoticias();
    console.log(`[cron/noticias] ok ${Date.now() - t0}ms ${JSON.stringify(r)}`);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron/noticias] FAIL ${Date.now() - t0}ms ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
