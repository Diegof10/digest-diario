import type { ClimaVivoSnapshot } from "@/lib/clima-vivo";

function hhmmArt(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "2026-09-25T07:45" (ya en ART) → "07:45" */
function horaDe(local: string | null): string | null {
  return local?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
}

export default function ClimaVivo({ clima }: { clima: ClimaVivoSnapshot }) {
  const leido = hhmmArt(clima.leidoAt);
  return (
    <section className="digest-panel mb-3 p-0" aria-label="Clima ahora">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#0b1f3a]">CLIMA AHORA</span>
        <span className="text-[9px] opacity-60">
          <a href={clima.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2">
            {clima.fuente}
          </a>
          {" · "}leído {leido} ART
        </span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {clima.ciudades.map((c) => {
          const hora = horaDe(c.horaDato);
          return (
            <div key={c.id} className="px-3 py-2">
              <div className="text-[10px] font-bold tracking-wide text-[#0b1f3a]">{c.nombre}</div>
              {c.tempC != null ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-lg font-bold tabular-nums leading-tight">
                      {c.tempC.toLocaleString("es-AR", { maximumFractionDigits: 1 })} °C
                    </span>
                    {c.condicion ? <span className="text-[11px] opacity-75">{c.condicion}</span> : null}
                  </div>
                  <div className="text-[10px] opacity-60">
                    {c.vientoKmh != null
                      ? `viento ${Math.round(c.vientoKmh)} km/h${c.vientoDir ? ` del ${c.vientoDir}` : ""}`
                      : "viento sin dato"}
                  </div>
                  <div className="text-[9px] opacity-50">
                    {clima.fuente} · dato {hora ?? "—"} ART · leído {leido}
                  </div>
                </>
              ) : (
                <div className="text-[11px] opacity-60">
                  sin dato · {clima.fuente}
                  <span className="block text-[9px] opacity-70">leído {leido} ART</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
