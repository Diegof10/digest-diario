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


/** ISO → "DD/MM HH:MM" en ART */
function fechaHoraCorta(iso: string): string {
  const p = partesArt(iso);
  return `${p.dd}/${p.mm} ${p.hh}:${p.mi}`;
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
      <h3 className="digest-panel-title">Fiscal (ARCA)</h3>

      {(() => {
        // Fecha de revisión del contenido fiscal (cron BO/ARCA o carga manual), NO la corrida del cron de mercado.
        const ref = fiscal.revisadoAt ?? null;
        const label = ref ? (ref.length === 10 ? ddmm(ref) : fechaHoraCorta(ref)) : null;
        const atraso = fiscal.habilesSinRevisar ?? null;
        const stale = !ref || atraso == null || atraso > 1;
        return (
          <>
            {stale ? (
              <p role="status" className="-mt-0.5 mb-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {ref ? `Sin revisar desde ${ddmm(ref)}` : "Sin revisar"}
              </p>
            ) : null}
            <p className="-mt-1 mb-1.5 text-[9px] opacity-55">
              {label ? `Revisado ${label}${fiscal.revisadoPor === "manual" ? " (manual)" : " · BO/ARCA"}` : null}
              {fiscal.cronOk === false ? " · última revisión automática con errores" : null}
            </p>
            {fiscal.sisaCambioAt ? (
              <p className="-mt-1 mb-1.5 text-[10px] leading-snug">
                ARCA actualizó la página{" "}
                <a
                  href="https://www.arca.gob.ar/actividadesAgropecuarias/sector-agro/sisa/informacion-productiva.asp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-slate-300 underline-offset-2"
                >
                  SISA · Información productiva
                </a>{" "}
                ({ddmm(fiscal.sisaCambioAt)})
              </p>
            ) : null}
          </>
        );
      })()}

      {empty ? (
        <p className="text-[12px] opacity-50">Sin novedad fiscal</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fiscal.novedades.length > 0 ? (
            <ul className="space-y-1">
              {fiscal.novedades.map((n, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2">
                      {n.texto}
                    </a>
                  ) : (
                    n.texto
                  )}
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
                    <span className="w-full text-[9px] opacity-50">Fuente: ARCA</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fiscal.vencimientos.length === 0 ? (
            <p className="border-t border-slate-100 pt-2 text-[11px] opacity-50">
              Sin vencimientos próximos
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
