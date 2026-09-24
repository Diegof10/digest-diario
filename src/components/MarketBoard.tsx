import type { ReactNode } from "react";
import type { ClimaEntry, MercadoRow, MercadoSnapshot } from "@/lib/types";
import { rowById } from "@/lib/mercado";

const CROP = {
  soja: { accent: "#1f6b3a", label: "SOJA" },
  maiz: { accent: "#e67e22", label: "MAÍZ" },
  trigo: { accent: "#c9a227", label: "TRIGO" },
} as const;

function Cell({
  r,
  dense,
}: {
  r: MercadoRow | undefined;
  dense?: boolean;
}) {
  if (!r?.valor) {
    return (
      <div className={dense ? "cell-empty" : "cell-empty py-1"}>
        <span className="text-[10px] uppercase tracking-wide opacity-40">—</span>
      </div>
    );
  }
  const pct =
    r.varPct != null
      ? `${r.varPct > 0 ? "+" : ""}${(r.varPct * 100).toLocaleString("es-AR", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })}%`
      : null;
  const senalColor =
    r.senal === "↑" ? "text-emerald-700" : r.senal === "↓" ? "text-red-700" : "text-slate-500";

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-base font-bold tabular-nums leading-tight sm:text-lg">
          {r.valor}
        </span>
        {r.unidad ? (
          <span className="text-[10px] opacity-55">{r.unidad}</span>
        ) : null}
        {r.senal ? (
          <span className={`text-sm font-bold ${senalColor}`}>{r.senal}</span>
        ) : null}
      </div>
      {r.extra || pct ? (
        <div className="mt-0.5 text-[10px] leading-snug opacity-60">
          {[r.contrato, r.extra || pct].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      <div className="mt-0.5 text-[9px] uppercase tracking-wide opacity-45">
        {[r.fuente, r.hora].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  tint,
}: {
  title: string;
  children: ReactNode;
  tint?: string;
}) {
  return (
    <section className="digest-panel flex flex-col">
      <h3
        className="digest-panel-title"
        style={tint ? { color: tint } : undefined}
      >
        {title}
      </h3>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function CropLine({
  crop,
  r,
}: {
  crop: keyof typeof CROP;
  r: MercadoRow | undefined;
}) {
  const c = CROP[crop];
  return (
    <div className="flex items-start gap-2 border-l-4 pl-2" style={{ borderColor: c.accent }}>
      <span
        className="w-12 shrink-0 pt-0.5 text-[10px] font-bold tracking-wide"
        style={{ color: c.accent }}
      >
        {c.label}
      </span>
      <Cell r={r} dense />
    </div>
  );
}

function RosarioBlock({ mercado }: { mercado: MercadoSnapshot }) {
  const soja = rowById(mercado.rows, "cac-soja");
  const maiz = rowById(mercado.rows, "cac-maiz");
  const trigo = rowById(mercado.rows, "cac-trigo");
  const bna = rowById(mercado.rows, "fx-bna");
  const fx = mercado.fxBna;

  function arsLine(r: MercadoRow | undefined) {
    if (!r?.valor || fx == null) return null;
    // es-AR: "." thousands, "," decimal (fmtNum output)
    const normalized = Number(
      String(r.valor).replace(/\./g, "").replace(",", "."),
    );
    if (!Number.isFinite(normalized)) return null;
    const ars = Math.round(normalized * fx);
    return ars.toLocaleString("es-AR");
  }

  return (
    <section className="digest-panel overflow-hidden p-0">
      <div className="flex items-center justify-between bg-[#0b1f3a] px-3 py-1.5 text-white">
        <span className="text-[11px] font-bold tracking-[0.12em]">
          ROSARIO · CAC / PIZARRA
        </span>
        <span className="text-[10px] opacity-80">
          {soja?.hora || maiz?.hora || "—"}
        </span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {(
          [
            ["soja", soja],
            ["maiz", maiz],
            ["trigo", trigo],
          ] as const
        ).map(([crop, r]) => {
          const c = CROP[crop];
          const ars = arsLine(r);
          return (
            <div key={crop} className="flex items-center gap-3 px-3 py-3">
              <div
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ background: c.accent }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold tracking-wide" style={{ color: c.accent }}>
                  {c.label}
                </div>
                {r?.valor ? (
                  <>
                    <div className="text-xl font-bold tabular-nums leading-none">
                      {r.unidad === "US$/t" ? `US$${r.valor}` : r.valor}
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-55">
                      {r.unidad}
                      {ars ? ` · ≈ $${ars} ARS/t (CAC×BNA)` : ""}
                    </div>
                    <div className="text-[9px] opacity-45">
                      {[r.fuente, r.hora].filter(Boolean).join(" · ")}
                    </div>
                  </>
                ) : (
                  <div className="text-sm opacity-40">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px]">
        <span>
          <strong>BNA</strong>{" "}
          {bna?.valor ? (
            <span className="tabular-nums font-semibold">{bna.valor}</span>
          ) : (
            "—"
          )}
          {bna?.fuente ? (
            <span className="ml-1 text-[9px] opacity-50">· {bna.fuente}</span>
          ) : null}
        </span>
        <span className="text-[9px] opacity-45">
          Fuentes {[...(mercado.sourcesOk ?? [])].slice(0, 4).join(" · ") || "—"}
        </span>
      </div>
    </section>
  );
}


function ClimaCountry({ e }: { e: ClimaEntry }) {
  const flag =
    e.country === "AR" ? "AR" : e.country === "BR" ? "BR" : "US";
  return (
    <div className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold tracking-wide text-[#0b1f3a]">
          {flag} · {e.countryLabel}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums opacity-50">
          {e.fecha}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug">{e.bullet}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] opacity-55">
        <span>{e.fuente}</span>
        <a
          href={e.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-slate-300 underline-offset-2 hover:opacity-90"
        >
          ver fuente
        </a>
        {e.secondaryUrl ? (
          <a
            href={e.secondaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-slate-300 underline-offset-2 hover:opacity-90"
          >
            {e.secondaryNote?.includes("PDF") ? "PDF" : "outlook"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ClimaBlock({ mercado }: { mercado: MercadoSnapshot }) {
  const clima = mercado.clima;
  const entries = clima?.entries ?? [];
  if (!clima?.ok || entries.length === 0) {
    return <p className="text-[11px] opacity-40">— sin fuente</p>;
  }
  const tag =
    clima.etiqueta === "ÚLTIMO_GUARDADO"
      ? "último valor guardado"
      : clima.etiqueta === "HECHO"
        ? "HECHO"
        : clima.etiqueta;
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <ClimaCountry key={e.country} e={e} />
      ))}
      <p className="text-[9px] uppercase tracking-wide opacity-40">{tag}</p>
    </div>
  );
}

function signalLabel(r: MercadoRow): string {
  if (r.id.startsWith("chicago-") || r.id.startsWith("cbot-")) {
    return `CBOT fut. ${r.producto}`;
  }
  if (r.id.startsWith("matba-")) {
    return `Matba fwd ${r.producto}`;
  }
  if (r.id.startsWith("cac-")) {
    return `CAC disp. ${r.producto}`;
  }
  if (r.id === "wti") return "WTI";
  return r.producto;
}

function SignalChip({ r }: { r: MercadoRow | undefined }) {
  if (!r) return null;
  const color =
    r.senal === "↑"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : r.senal === "↓"
        ? "bg-red-50 text-red-800 border-red-200"
        : r.valor
          ? "bg-slate-50 text-slate-700 border-slate-200"
          : "bg-slate-50 text-slate-400 border-slate-100";
  return (
    <div
      className={`flex flex-col gap-0.5 rounded border px-2 py-1.5 text-[11px] ${color}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium leading-tight">{signalLabel(r)}</span>
        <span className="tabular-nums font-bold shrink-0">
          {r.valor ? (
            <>
              {r.senal ?? "→"} {r.valor}
              {r.unidad ? (
                <span className="ml-0.5 font-normal opacity-60">{r.unidad}</span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <p className="text-[9px] opacity-55 leading-tight">
        {r.valor
          ? [r.fuente, r.hora].filter(Boolean).join(" · ") || "sin fuente"
          : "sin fuente"}
      </p>
    </div>
  );
}

export default function MarketBoard({ mercado }: { mercado: MercadoSnapshot }) {
  const sojaChi = rowById(mercado.rows, "chicago-soja");
  const maizChi = rowById(mercado.rows, "chicago-maiz");
  const trigoChi = rowById(mercado.rows, "chicago-trigo");

  const sojaMay = rowById(mercado.rows, "matba-soja-may");
  const sojaNov = rowById(mercado.rows, "matba-soja-nov");
  const maizMat = rowById(mercado.rows, "matba-maiz");
  const trigoMat = rowById(mercado.rows, "matba-trigo");

  const sojaCac = rowById(mercado.rows, "cac-soja");
  const maizCac = rowById(mercado.rows, "cac-maiz");
  const trigoCac = rowById(mercado.rows, "cac-trigo");

  const usda = rowById(mercado.rows, "usda");
  const progress = rowById(mercado.rows, "crop-progress");
  const noticias = rowById(mercado.rows, "noticias");
  const wti = rowById(mercado.rows, "wti");

  return (
    <div className="flex flex-col gap-3">
      <RosarioBlock mercado={mercado} />

      {/* Row A */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Panel title="Chicago · futuro CBOT (Yahoo)">
          <p className="mb-1 text-[9px] leading-snug opacity-55">
            Futuro CBOT en US$/t (no es pizarra ni disponible).
          </p>
          <CropLine crop="soja" r={sojaChi} />
          <CropLine crop="maiz" r={maizChi} />
          <CropLine crop="trigo" r={trigoChi} />
        </Panel>

        <Panel title="Matba · forward cosecha" tint="#0b1f3a">
          <p className="mb-1 text-[9px] leading-snug opacity-55">
            Forward Matba Rofex (contrato). No mezclar con disponible.
          </p>
          <div className="flex items-start gap-2 border-l-4 border-[#1f6b3a] pl-2">
            <span className="w-14 shrink-0 pt-0.5 text-[10px] font-bold text-[#1f6b3a]">
              SOJA
            </span>
            <div className="grid w-full grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] opacity-50">May fwd</div>
                <Cell r={sojaMay} dense />
              </div>
              <div>
                <div className="text-[9px] opacity-50">Nov fwd</div>
                <Cell r={sojaNov} dense />
              </div>
            </div>
          </div>
          <CropLine crop="maiz" r={maizMat} />
          <CropLine crop="trigo" r={trigoMat} />
        </Panel>

        <Panel title="CAC Rosario · disponible" tint="#1f6b3a">
          <p className="mb-1 text-[9px] leading-snug opacity-55">
            Disponible / pizarra plaza (CAC). No es futuro CBOT ni Matba.
          </p>
          <CropLine crop="soja" r={sojaCac} />
          <CropLine crop="maiz" r={maizCac} />
          <CropLine crop="trigo" r={trigoCac} />
        </Panel>
      </div>

      {/* Row B */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Panel title="USDA / WASDE · Crop Progress">
          {usda?.valor ? (
            <div>
              <p className="text-[11px] leading-snug">{usda.valor}</p>
              <p className="mt-1 text-[9px] opacity-45">
                {[usda.fuente, usda.hora].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : (
            <p className="text-[11px] opacity-40">—</p>
          )}
          {progress?.valor ? (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="text-[10px] font-semibold opacity-70">Crop Progress</p>
              <p className="text-[11px] leading-snug">{progress.valor}</p>
              <p className="mt-1 text-[9px] opacity-45">
                {[progress.fuente, progress.hora].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Noticias">
          {noticias?.valor ? (
            <p className="text-[11px]">{noticias.valor}</p>
          ) : (
            <p className="text-[11px] opacity-40">— sin fuente</p>
          )}
        </Panel>

        <Panel title="Clima AR / BR / US">
          <ClimaBlock mercado={mercado} />
        </Panel>
      </div>

      {/* Señales */}
      <section className="digest-panel">
        <h3 className="digest-panel-title">Tablero señales</h3>
        <p className="mb-1.5 text-[10px] opacity-55">
          Cada chip: plaza + tipo (futuro / forward / disponible) + fuente. No
          mezclar CBOT con Matba ni con CAC.
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
          <SignalChip r={sojaChi} />
          <SignalChip r={maizChi} />
          <SignalChip r={trigoChi} />
          <SignalChip r={sojaMay ?? sojaNov} />
          <SignalChip r={sojaCac} />
          <SignalChip r={wti} />
        </div>
      </section>
    </div>
  );
}
