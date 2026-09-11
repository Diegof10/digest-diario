import { NextResponse } from "next/server";
import { loadLastState, loadWatchlist } from "@/lib/store";
import { scoringLabel } from "@/lib/sisa";

export const dynamic = "force-dynamic";

export async function GET() {
  const watch = await loadWatchlist();
  const state = await loadLastState();
  const rows = watch.map((w) => {
    const s = state[w.cuit.replace(/\D/g, "")];
    return {
      cuit: w.cuit,
      label: w.label || s?.razonSocial || "",
      scoring: s ? scoringLabel(s.scoring) : "sin estado guardado",
      situacionCategoria: s?.situacionCategoria || "—",
      categoria: s?.categoria || "—",
      fechaVigenciaEstado: s?.fechaVigenciaEstado || "—",
      fetchedAt: s?.fetchedAt || null,
    };
  });
  return NextResponse.json({ rows });
}
