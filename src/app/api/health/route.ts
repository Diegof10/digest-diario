import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "resumen-agrario",
    producto: "Resumen agrario",
    cron: "0 10 * * * → /api/cron/digest (7:00 ARG)",
    vercel: Boolean(process.env.VERCEL),
    cronSecretPresent: Boolean(process.env.CRON_SECRET),
  });
}
