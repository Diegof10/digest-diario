import { NextResponse } from "next/server";
import { assembleDigest } from "@/lib/digest";
import { loadResumenMatutino } from "@/lib/resumen-matutino";

export const dynamic = "force-dynamic";

/** Active morning brief lines (CoS txt if body present, else auto fallback). */
export async function GET() {
  const file = await loadResumenMatutino();
  const digest = await assembleDigest();
  const fromCos = Boolean(file && file.lineas.length > 0);
  return NextResponse.json({
    ok: true,
    fecha: digest.fecha,
    titulo_ui: "Resumen matutino",
    lineas: digest.resumenMatutino,
    fuente: fromCos ? file!.fuente : "auto-digest",
    snapshot: file
      ? {
          fecha: file.fecha,
          tituloUi: file.tituloUi,
          lineCount: file.lineas.length,
          path: file.rawPath,
        }
      : null,
  });
}
