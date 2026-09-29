import { isoToDmy } from "@/lib/habiles";
import type { FiscalSnapshot } from "@/lib/types";

const TZ = "America/Argentina/Cordoba";

function partesArt(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => (parts.find((p) => p.type === t)?.value ?? "").padStart(2, "0");
  return { dd: g("day"), mm: g("month"), yyyy: g("year"), hh: g("hour").replace(/^24$/, "00"), mi: g("minute") };
}

/** ISO → "DD/MM/AAAA HH:MM" en ART */
function fechaHoraArt(iso: string): string {
  const p = partesArt(iso);
  return `${p.dd}/${p.mm}/${p.yyyy} ${p.hh}:${p.mi}`;
}

/** ISO o yyyy-mm-dd → "DD/MM" (ART) */
function ddmm(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoToDmy(s).slice(0, 5);
  const p = partesArt(s);
  return `${p.dd}/${p.mm}`;
}

export default function FiscalBlock({ fiscal }: { fiscal: FiscalSnapshot }) {
  const vigentes = fiscal.normasVigentes ?? [];
  const empty =
    !fiscal.ok ||
    (fiscal.novedades.length === 0 && vigentes.length === 0 && fiscal.vencimientos.length === 0);

  return (
    <section className="digest-panel">
      <h3 className="digest-panel-title">Fiscal (ARCA / consejos)</h3>

      {(() => {
        const ref = fiscal.cargaManual ?? fiscal.cronAt; // revisión del contenido fiscal (rutina diaria); el cron sólo refresca mercado
        const hoy = fiscal.hoy ?? null;
        const refDia = ref ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date(ref.length === 10 ? `${ref}T12:00:00-03:00` : ref)) : null;
        if (hoy && refDia === hoy) return null;
        return (
          <p role="status" className="-mt-0.5 mb-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            {ref ? `Fiscal sin actualizar desde ${ref.length === 10 ? ddmm(ref) : `${fechaHoraArt(ref)} ART`}` : "Fiscal sin actualizar (sin fecha de corrida)"}
          </p>
        );
      })()}
      <p className="-mt-1 mb-1.5 text-[9px] opacity-55">
        {fiscal.cronAt
          ? `Última actualización (cron): ${fechaHoraArt(fiscal.cronAt)} ART`
          : fiscal.cargaManual
            ? `Última actualización: carga manual ${ddmm(fiscal.cargaManual)}`
            : "Última actualización: —"}
      </p>

      {empty ? (
        <p className="text-[12px] opacity-50">Sin novedad fiscal</p>
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
            <p className="text-[12px] leading-snug opacity-60">Sin novedad fiscal</p>
          )}

          {vigentes.length > 0 ? (
            <p className="text-[10px] leading-snug opacity-70">
              <span className="font-semibold">Normas vigentes:</span>{" "}
              {vigentes.map((n, i) => {
                const label = n.norma || n.texto.split(":")[0];
                const bo = n.boFecha ? ` (BO ${isoToDmy(n.boFecha)})` : "";
                return (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2">
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                    {bo}
                  </span>
                );
              })}
            </p>
          ) : null}

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
                    {v.detalle && /verificar/i.test(v.detalle) ? (
                      <span className="w-full text-[9px] font-semibold text-amber-600">verificar cronograma ARCA</span>
                    ) : null}
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
