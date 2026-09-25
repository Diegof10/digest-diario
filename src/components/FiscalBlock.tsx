import { isoToDmy } from "@/lib/habiles";
import type { FiscalSnapshot } from "@/lib/types";

export default function FiscalBlock({ fiscal }: { fiscal: FiscalSnapshot }) {
  const linea =
    fiscal.lineaTablero?.trim() ||
    fiscal.novedad?.trim() ||
    "sin novedad fiscal";
  const empty =
    !fiscal.ok ||
    (linea === "sin novedad fiscal" &&
      fiscal.novedades.length === 0 &&
      fiscal.vencimientos.length === 0);

  return (
    <section className="digest-panel">
      <h3 className="digest-panel-title">Fiscal (ARCA / consejos)</h3>

      <p className="-mt-1 mb-1.5 text-[9px] opacity-55">
        Última revisión: {fiscal.ultimaRevision ? isoToDmy(fiscal.ultimaRevision) : "—"}
      </p>

      {empty ? (
        <p className="text-[12px] opacity-50">
          sin novedad · {fiscal.hoy ? isoToDmy(fiscal.hoy) : "—"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {fiscal.novedades.length > 0 ? (
            <ul className="space-y-1">
              {fiscal.novedades.map((n, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  {n.texto}
                  {n.fuente ? (
                    <span className="ml-1 text-[9px] opacity-50">
                      · {n.fuente}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] leading-snug opacity-60">
              sin novedad · {fiscal.hoy ? isoToDmy(fiscal.hoy) : "—"}
            </p>
          )}

          {fiscal.vencimientos.length > 0 ? (
            <div className="border-t border-slate-100 pt-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-55">
                Vencimientos próximos
              </p>
              <ul className="space-y-1">
                {fiscal.vencimientos.map((v, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px] leading-snug"
                  >
                    <span className="font-medium">{v.concepto}</span>
                    <span className="tabular-nums opacity-70">{v.ventana}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fiscal.vencimientos.length === 0 ? (
            <p className="border-t border-slate-100 pt-2 text-[11px] opacity-50">
              sin vencimientos próximos cargados
            </p>
          ) : null}

          {fiscal.fuente ? (
            <p className="text-[9px] opacity-45">
              {fiscal.fuente}
              {fiscal.fecha ? ` · ${isoToDmy(fiscal.fecha)}` : ""}
              {fiscal.vencidosOcultos
                ? ` · ${fiscal.vencidosOcultos} vencimiento(s) ya pasado(s) oculto(s)`
                : ""}
            </p>
          ) : null}

          {fiscal.pie ? (
            <p className="border-t border-slate-100 pt-1.5 text-[9px] leading-snug opacity-55">
              {fiscal.pie}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
