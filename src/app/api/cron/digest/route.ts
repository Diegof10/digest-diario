import { NextRequest, NextResponse } from "next/server";
import { assembleDigest, DEFAULT_KM } from "@/lib/digest";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron: 0 10 * * * (7:00 America/Argentina/Cordoba = UTC-3).
 * Protegido con CRON_SECRET (Bearer) cuando está definido.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;

  const snap = await assembleDigest({ km });
  return NextResponse.json({
    ok: true,
    cron: true,
    digest: snap,
    note: "Snapshot armado. Persistencia durable / mail / WhatsApp = v2 (Informe).",
  });
}
