import { NextResponse } from "next/server";
import { loadWatchlist, persistenceMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const watch = await loadWatchlist();
  const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return NextResponse.json({
    ok: true,
    app: "alerta-sisa",
    watched: watch.length,
    persistence: persistenceMode(),
    blobTokenPresent: tokenPresent,
    mailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_TO),
    vercel: Boolean(process.env.VERCEL),
    tip: tokenPresent
      ? "Blob OK"
      : "Falta BLOB_READ_WRITE_TOKEN en este deploy. Conectá el store al proyecto y redeploy.",
  });
}
