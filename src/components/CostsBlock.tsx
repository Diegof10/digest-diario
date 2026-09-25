import type { CatacSnapshot, CostoInsumoSlot } from "@/lib/types";

function etiquetaHint(e: CostoInsumoSlot["etiqueta"]): string | null {
  if (e === "ÚLTIMO_GUARDADO") return "último valor guardado";
  if (e === "VACÍO") return "sin dato";
  if (e === "SUPUESTO") return "supuesto";
  return null;
}

function hasPrecio(i: CostoInsumoSlot): boolean {
  return Boolean((i.valor || i.nota) && i.fuente && i.fecha);
}

function Viejo() {
  return (
    <span
      className="ml-1 rounded bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-800"
      title="Más de un ciclo de publicación sin actualizar"
    >
      viejo
    </span>
  );
}

export default function CostsBlock({
  catac,
  insumos,
  km,
}: {
  catac: CatacSnapshot;
  insumos: CostoInsumoSlot[];
  km: number;
}) {
  const visibles = insumos.filter(hasPrecio);
  const showCatac = catac.arsPerTon != null;

  if (!showCatac && visibles.length === 0) {
    return null;
  }

  return (
    <section className="digest-panel">
      <h3 className="digest-panel-title">Costos · CATAC + insumos</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {showCatac ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase opacity-50">Flete CATAC · {km} km</div>
            <div className="text-sm font-bold tabular-nums">
              {`${catac.arsPerTon!.toLocaleString("es-AR")} ARS/t`}
            </div>
            <div className="text-[9px] opacity-70">{catac.statusLabel}</div>
            <div className="text-[9px] opacity-50">
              Referencia de piso del flete (no es lo que se paga en el pueblo)
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
        ) : null}
        {visibles.map((i) => {
          const hint = etiquetaHint(i.etiqueta);
          return (
            <div
              key={i.id}
              className="rounded border border-slate-200 px-2 py-1.5"
            >
              <div className="text-[9px] uppercase opacity-50">{i.label}</div>
              {i.valor ? (
                <div className="text-sm font-bold tabular-nums">
                  {i.valor}
                  {i.unidad ? (
                    <span className="ml-0.5 text-[9px] font-normal opacity-55">
                      {i.unidad}
                    </span>
                  ) : null}
                  {i.frescura === "viejo" ? <Viejo /> : null}
                </div>
              ) : (
                <div className="text-[10px] leading-snug opacity-55">{i.nota}</div>
              )}
              <div className="text-[9px] opacity-45">
                {i.fuente && i.fecha
                  ? `${i.fuente} · ${i.fecha}`
                  : hint ?? "sin fuente"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
