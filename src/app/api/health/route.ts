import { NextResponse } from "next/server";
import { loadWatchlist } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const watch = await loadWatchlist();
  return NextResponse.json({
    ok: true,
    app: "alerta-sisa",
    watched: watch.length,
    mailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_TO),
  });
}
