import type { HaciendaIndice, HaciendaSnapshot } from "@/lib/hacienda";

const nf = (n: number, d = 0) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: d, minimumFractionDigits: d });

const corta = (f: string) => f.slice(0, 5);

function hhmmArt(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function Indice({ label, i }: { label: string; i: HaciendaIndice | null }) {
  if (!i) {
    return (
      <div className="px-3 py-2">
        <div className="text-[10px] font-bold tracking-wide">{label}</div>
        <div className="text-[11px] opacity-50">—</div>
      </div>
    );
  }
  if (i.valor == null) {
    return (
      <div className="px-3 py-2">
        <div className="text-[10px] font-bold tracking-wide">{label}</div>
        <div className="text-[11px] font-semibold opacity-75">Sin {label} (menos de 300 novillos)</div>
        <div className="text-[9px] opacity-50">remate {corta(i.fecha)}</div>
      </div>
    );
  }
  const pct = i.varPct != null ? i.varPct * 100 : null;
  const color = pct == null ? "opacity-60" : pct > 0 ? "text-emerald-500" : pct < 0 ? "text-red-500" : "opacity-60";
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-bold tracking-wide">{label}</div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums leading-tight">{nf(i.valor, 1)}</span>
        <span className="text-[10px] opacity-60">$/kg vivo</span>
        {pct != null ? (
          <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
            {pct > 0 ? "+" : ""}
            {nf(pct, 1)}%
          </span>
        ) : null}
      </div>
      <div className="text-[9px] opacity-50">
        remate {corta(i.fecha)}
        {i.prevFecha && i.varPct != null ? ` vs remate ${corta(i.prevFecha)}` : ""}
      </div>
    </div>
  );
}

export default function HaciendaBlock({ hacienda }: { hacienda: HaciendaSnapshot }) {
  const h = hacienda;
  return (
    <section className="digest-panel p-0" aria-label="Mercado ganadero">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-500/20 px-3 py-1.5">
        <h3 className="digest-panel-title mb-0">Mercado ganadero · Cañuelas</h3>
        <span className="text-[9px] opacity-60">
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Fuente: {h.fuente}
          </a>
          {" · "}act. {hhmmArt(h.leidoAt)}
        </span>
      </div>

      {!h.ok ? (
        <p className="px-3 py-2 text-[11px] opacity-60">Sin dato</p>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-slate-500/20 sm:grid-cols-3">
            <Indice label="INMAG" i={h.inmag} />
            <Indice label="IGMAG" i={h.igmag} />
            <div className="col-span-2 border-t border-slate-500/20 px-3 py-2 sm:col-span-1 sm:border-t-0">
              <div className="text-[10px] font-bold tracking-wide">Ingreso</div>
              {h.dia ? (
                <div className="text-[11px] tabular-nums">
                  remate {corta(h.dia.fecha)}: <b>{nf(h.dia.cabezas)}</b> cab.
                </div>
              ) : null}
              {h.hoy ? (
                <div className="text-[11px] tabular-nums opacity-75">
                  {corta(h.hoy.fecha)}: {nf(h.hoy.cabezas)} cab. (operando)
                </div>
              ) : null}
            </div>
          </div>

          {h.categorias.length > 0 && h.dia ? (
            <div className="overflow-x-auto border-t border-slate-500/20">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wide opacity-60">
                    <th className="px-3 py-1 text-left font-semibold">
                      Categoría · remate {corta(h.dia.fecha)}
                      {h.dia.estado ? ` (${h.dia.estado})` : ""}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold">Prom. $/kg vivo</th>
                    <th className="px-2 py-1 text-right font-semibold">Mín–Máx</th>
                    <th className="px-2 py-1 text-right font-semibold">Cab.</th>
                    <th className="px-3 py-1 text-right font-semibold">Kg prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {h.categorias.map((c) => (
                    <tr key={c.categoria} className="border-t border-slate-500/10">
                      <td className="px-3 py-1 font-semibold">{c.categoria}</td>
                      <td className="px-2 py-1 text-right font-bold">{nf(c.promedio)}</td>
                      <td className="px-2 py-1 text-right opacity-70">
                        {c.minimo != null && c.maximo != null ? `${nf(c.minimo)}–${nf(c.maximo)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">{nf(c.cabezas)}</td>
                      <td className="px-3 py-1 text-right opacity-70">{c.kgProm != null ? nf(c.kgProm) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
