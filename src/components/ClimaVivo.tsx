import type { ClimaVivoSnapshot } from "@/lib/clima-vivo";
import type { Tema } from "@/lib/tema";
import { WeatherIcon } from "@/components/ui/WeatherIcon";

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

export default function ClimaVivo({ clima, tema = "base" }: { clima: ClimaVivoSnapshot; tema?: Tema }) {
  const leido = hhmmArt(clima.leidoAt);
  if (tema !== "base") return <ClimaVivoUi clima={clima} leido={leido} />;
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

/** Propuesta: ícono según weather_code, temperatura grande, ciudad abajo; fuente y hora del dato. */
function ClimaVivoUi({ clima, leido }: { clima: ClimaVivoSnapshot; leido: string }) {
  return (
    <section className="digest-panel clima-ui mb-3 p-0" aria-label="Clima ahora">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200/60 px-3 py-1.5">
        <span className="text-[11px] font-bold tracking-[0.12em]">CLIMA AHORA</span>
        <span className="text-[9px] opacity-70">
          <a href={clima.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {clima.fuente}
          </a>
          {" · "}leído {leido} ART
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-200/60">
        {clima.ciudades.map((c) => {
          const hora = horaDe(c.horaDato);
          return (
            <div key={c.id} className="flex flex-col items-center px-1 py-2 text-center sm:px-3">
              {c.tempC != null ? (
                <>
                  <WeatherIcon code={c.code} className="h-9 w-9 sm:h-11 sm:w-11" />
                  <span className="font-mono text-2xl font-bold tabular-nums leading-none sm:text-3xl">
                    {c.tempC.toLocaleString("es-AR", { maximumFractionDigits: 1 })}°
                  </span>
                  <span className="mt-1 text-[11px] font-bold">{c.nombre}</span>
                  <span className="text-[10px] opacity-70">{c.condicion ?? ""}</span>
                  <span className="text-[10px] opacity-70">
                    {c.vientoKmh != null ? `viento ${Math.round(c.vientoKmh)} km/h${c.vientoDir ? ` ${c.vientoDir}` : ""}` : "viento sin dato"}
                  </span>
                  <span className="mt-0.5 text-[9px] opacity-55">dato {hora ?? "—"} ART</span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-bold">{c.nombre}</span>
                  <span className="text-[11px] opacity-70">sin dato · {clima.fuente}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
