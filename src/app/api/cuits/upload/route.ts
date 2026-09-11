import { NextRequest, NextResponse } from "next/server";
import { parseCuitsCsv } from "@/lib/csv";
import { persistenceMode, saveWatchlist } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart file field "file" or raw text/csv body.
 * Replaces the hosted watchlist used by the daily cron.
 */
export async function POST(req: NextRequest) {
  try {
    const ctype = req.headers.get("content-type") || "";
    let raw = "";
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "Falta archivo CSV (campo file)" },
          { status: 400 }
        );
      }
      raw = await file.text();
    } else {
      raw = await req.text();
    }

    const parsed = parseCuitsCsv(raw);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo armar la lista",
          details: parsed.errors,
        },
        { status: 400 }
      );
    }

    if (process.env.VERCEL && persistenceMode() === "filesystem") {
      // On Vercel FS is ephemeral — still save for this instance but warn
      const saved = await saveWatchlist(parsed.items, "csv");
      return NextResponse.json({
        ok: true,
        count: parsed.items.length,
        skipped: parsed.skipped,
        errors: parsed.errors.slice(0, 20),
        updatedAt: saved.updatedAt,
        persistence: persistenceMode(),
        warning:
          "En Vercel el disco no persiste entre deploys. Configurá BLOB_READ_WRITE_TOKEN para alojar el CSV de forma estable.",
      });
    }

    const saved = await saveWatchlist(parsed.items, "csv");
    return NextResponse.json({
      ok: true,
      count: parsed.items.length,
      skipped: parsed.skipped,
      errors: parsed.errors.slice(0, 20),
      updatedAt: saved.updatedAt,
      persistence: persistenceMode(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
