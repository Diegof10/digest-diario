import { NextRequest, NextResponse } from "next/server";
import { parseCuitsCsv } from "@/lib/csv";
import { persistenceMode, saveWatchlist } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readUploadText(req: NextRequest): Promise<string> {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) {
      throw new Error('Falta archivo CSV (campo "file")');
    }
    // Duck-type: en algunos runtimes no es instanceof File
    if (typeof (file as Blob).text === "function") {
      return await (file as Blob).text();
    }
    if (typeof file === "string") return file;
    throw new Error("No pude leer el archivo CSV");
  }
  return await req.text();
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readUploadText(req);
    if (!raw.trim()) {
      return NextResponse.json(
        { ok: false, error: "CSV vacío" },
        { status: 400 }
      );
    }

    // Reject obvious Excel binary
    if (raw.startsWith("PK") || raw.includes("xl/")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Parece un Excel (.xlsx). Guardalo como CSV (UTF-8) e intentá de nuevo.",
        },
        { status: 400 }
      );
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

    const saved = await saveWatchlist(parsed.items, "csv");
    const mode = persistenceMode();
    return NextResponse.json({
      ok: true,
      count: parsed.items.length,
      skipped: parsed.skipped,
      errors: parsed.errors.slice(0, 20),
      updatedAt: saved.updatedAt,
      persistence: mode,
      warning:
        mode === "filesystem" && process.env.VERCEL
          ? "En Vercel sin BLOB_READ_WRITE_TOKEN la lista vive en /tmp y se puede perder. Configurá Blob."
          : undefined,
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
