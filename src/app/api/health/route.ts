import { NextResponse } from "next/server";
import vercelJson from "../../../../vercel.json";
import { blobConfigured, blobLastError, readSerie } from "@/lib/serie-blob";

export const dynamic = "force-dynamic";

export async function GET() {
  const serie = await readSerie(true).catch(() => null);
  const puntos = serie
    ? Object.fromEntries(
        Object.entries(serie.series).map(([k, g]) => [
          k,
          Object.fromEntries(
            Object.entries(g).map(([grano, fechas]) => {
              const fs = Object.keys(fechas).sort();
              return [grano, { n: fs.length, ultima: fs[fs.length - 1] ?? null }];
            }),
          ),
        ]),
      )
    : null;
  return NextResponse.json({
    ok: true,
    app: "resumen-agrario",
    producto: "Resumen agrario",
    crons: (vercelJson.crons ?? []).map((c) => `${c.schedule} → ${c.path}`),
    cronNote: "UTC: 0 10 * * * = 07:00 ART; 15 14 * * 1-5 = 11:15 ART; 30 21 * * 1-5 = 18:30 ART",
    vercel: Boolean(process.env.VERCEL),
    cronSecretPresent: Boolean(process.env.CRON_SECRET),
    blob: {
      configured: blobConfigured(),
      storeIdPresent: Boolean(process.env.BLOB_STORE_ID),
      rwTokenPresent: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      serieUpdatedAt: serie?.updatedAt ?? null,
      puntos,
      lastError: blobLastError(),
    },
  });
}
