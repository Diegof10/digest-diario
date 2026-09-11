import { NextResponse } from "next/server";
import { loadLastState, loadWatchlist, persistenceMode } from "@/lib/store";
import { scoringLabel } from "@/lib/sisa";

export const dynamic = "force-dynamic";

export async function GET() {
  const watch = await loadWatchlist();
  const state = await loadLastState();
  const rows = watch.map((w) => {
    const cuit = w.cuit.replace(/\D/g, "");
    const s = state[cuit];
    return {
      cuit: w.cuit,
      label: w.label || s?.razonSocial || "",
      mailTo: w.mailTo || null,
      scoring: s ? scoringLabel(s.scoring) : "sin baseline (próximo cron)",
      situacionCategoria: s?.situacionCategoria || "—",
      categoria: s?.categoria || "—",
      fechaVigenciaEstado: s?.fechaVigenciaEstado || "—",
      fetchedAt: s?.fetchedAt || null,
    };
  });
  return NextResponse.json({
    rows,
    count: rows.length,
    persistence: persistenceMode(),
  });
}
