import type { CatacSnapshot, CostoInsumoSlot } from "@/lib/types";

export default function CostsBlock({
  catac,
  insumos,
  km,
}: {
  catac: CatacSnapshot;
  insumos: CostoInsumoSlot[];
  km: number;
}) {
  return (
    <section className="digest-panel">
      <h3 className="digest-panel-title">Costos · CATAC + insumos</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[9px] uppercase opacity-50">Flete CATAC</div>
          <div className="text-sm font-bold tabular-nums">
            {catac.arsPerTon != null
              ? `${catac.arsPerTon.toLocaleString("es-AR")} ARS/t`
              : "—"}
          </div>
          <div className="text-[9px] opacity-55">
            {km} km · {catac.statusLabel}
          </div>
          {catac.pdfUrl ? (
            <a
              className="text-[9px] underline opacity-60"
              href={catac.pdfUrl}
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
          ) : null}
        </div>
        {insumos.map((i) => (
          <div
            key={i.id}
            className="rounded border border-slate-200 px-2 py-1.5"
          >
            <div className="text-[9px] uppercase opacity-50">{i.label}</div>
            <div className="text-sm font-bold tabular-nums opacity-70">
              {i.valor ?? "—"}
              {i.valor && i.unidad ? (
                <span className="ml-0.5 text-[9px] font-normal opacity-55">
                  {i.unidad}
                </span>
              ) : null}
            </div>
            <div className="text-[9px] opacity-45">
              {i.fuente && i.fecha
                ? `${i.fuente} · ${i.fecha}`
                : "sin fuente"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
