import type { MercadoRow } from "@/lib/types";
import { GrainIcon, grainFromText } from "@/components/ui/GrainIcon";
import { pieFuente } from "@/lib/ticker";

function label(r: MercadoRow): string {
  if (r.id.startsWith("chicago-") || r.id.startsWith("cbot-")) return `CBOT ${r.producto}`;
  if (r.id.startsWith("matba-")) return `Matba ${r.producto.split(" ")[0]}${r.contrato ? ` ${r.contrato}` : ""}`;
  if (r.id.startsWith("cac-")) return `CAC ${r.producto}`;
  if (r.id === "wti") return "WTI";
  return r.producto;
}

function Var({ r }: { r: MercadoRow }) {
  const v = r.varPct;
  if (v == null || !Number.isFinite(v)) return <span className="text-slate-500">sin var.</span>;
  const pct = Math.abs(v * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (pct === "0,00") return <span className="text-slate-400">= 0,00%</span>;
  return v > 0 ? <span className="text-emerald-400">▲ {pct}%</span> : <span className="text-red-400">▼ {pct}%</span>;
}

/** Tablero de señales estilo mesa: fondo negro, números monoespaciados, ▲ verde / ▼ rojo / gris sin cambio. */
export default function TradingBoard({ rows }: { rows: Array<MercadoRow | undefined> }) {
  const list = rows.filter((r): r is MercadoRow => Boolean(r));
  return (
    <section className="trading-board zona-oscura rounded p-2.5">
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">Tablero de señales</h3>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-slate-800 md:grid-cols-3">
        {list.map((r) => {
          const g = grainFromText(r.producto);
          return (
            <div key={r.id} className="flex flex-col gap-0.5 bg-black px-2 py-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                {g ? <GrainIcon grano={g} className="h-3.5 w-3.5 shrink-0" /> : null}
                {label(r)}
              </span>
              <div className="font-mono text-base font-bold tabular-nums leading-tight text-slate-50 sm:text-lg">
                {r.valor ?? <span className="text-slate-600">—</span>}
                {r.valor && r.unidad ? <span className="ml-1 text-[10px] font-normal text-slate-500">{r.unidad}</span> : null}
              </div>
              <div className="font-mono text-[11px] tabular-nums">{r.valor ? <Var r={r} /> : null}</div>
              <div className="font-mono text-[9px] text-slate-500">
                {pieFuente(r)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
