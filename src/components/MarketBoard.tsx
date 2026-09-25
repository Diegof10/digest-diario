import type { ReactNode } from "react";
import type { ClimaEntry, MercadoRow, MercadoSnapshot } from "@/lib/types";
import { rowById } from "@/lib/mercado";
import type { Tema } from "@/lib/tema";
import { GrainLabel } from "@/components/ui/GrainIcon";
import NoticiasUi from "@/components/ui/NoticiasUi";
import TradingBoard from "@/components/ui/TradingBoard";

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
        <span className="text-[10px] tracking-wide opacity-50">
          {r?.frescura === "vencido" && r.extra ? r.extra : "—"}
        </span>
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
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] uppercase tracking-wide">
        <span className="opacity-45">{[r.fuente, r.hora].filter(Boolean).join(" · ")}</span>
        <ViejoBadge r={r} />
      </div>
    </div>
  );
}

export function ViejoBadge({ r }: { r?: Pick<MercadoRow, "frescura"> | null }) {
  if (r?.frescura !== "viejo") return null;
  return (
    <span
      className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold normal-case tracking-normal text-amber-800"
      title="Dato con 1 a 3 días hábiles de atraso vs el último día hábil"
    >
      viejo
    </span>
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
  tema = "base",
}: {
  crop: keyof typeof CROP;
  r: MercadoRow | undefined;
  tema?: Tema;
}) {
  const c = CROP[crop];
  if (tema !== "base") {
    return (
      <div className="flex items-start gap-2 border-l-4 pl-2" style={{ borderColor: "var(--g-" + crop + ")" }}>
        <span className="w-16 shrink-0 pt-0.5 text-[10px]">
          <GrainLabel grano={crop} />
        </span>
        <Cell r={r} dense />
      </div>
    );
  }
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

const PLAZAS = [
  { id: "cac", titulo: "Pizarra CAC Rosario" },
  { id: "afa", titulo: "AFA San Martín" },
  { id: "aca", titulo: "ACA Timbúes" },
] as const;

function PlazaCell({ r }: { r: MercadoRow | undefined }) {
  if (!r) return <div className="text-sm opacity-30">—</div>;
  if (!r.valor) {
    return <div className="text-[10px] leading-snug opacity-50">{r.extra ?? "—"}</div>;
  }
  const tone =
    r.senal === "↑" ? "text-emerald-700" : r.senal === "↓" ? "text-red-700" : "text-slate-500";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums leading-none">
          {r.unidad === "ARS/t" ? `$${r.valor}` : `US$${r.valor}`}
        </span>
        <span className="text-[9px] opacity-50">{r.unidad}</span>
      </div>
      {r.valorUsd ? (
        <div className="text-[10px] tabular-nums opacity-70">≈ US${r.valorUsd}/t</div>
      ) : null}
      <div className={`text-[10px] font-semibold tabular-nums ${tone}`}>
        {r.varAbs ? `(${r.varAbs})` : <span className="font-normal opacity-50">sin cierre previo</span>}
      </div>
    </div>
  );
}

function PlazasBlock({ mercado, tema = "base" }: { mercado: MercadoSnapshot; tema?: Tema }) {
  const cols = PLAZAS.map((p) => {
    const rows = (["soja", "maiz", "trigo"] as const).map((g) =>
      rowById(mercado.rows, `${p.id}-${g}`),
    );
    const any = rows.find(Boolean);
    return { ...p, rows, any };
  }).filter((c) => c.any);
  const tcNotes = Array.from(
    new Set(cols.flatMap((c) => c.rows.map((r) => (r?.valorUsd && r.tc ? r.tc : null))).filter(Boolean)),
  ) as string[];

  return (
    <section className={`digest-panel overflow-hidden p-0 ${tema !== "base" ? "plazas-ui" : ""}`}>
      <div className="flex items-center justify-between bg-[#0b1f3a] px-3 py-1.5 text-white">
        <span className="text-[11px] font-bold tracking-[0.12em]">PLAZAS FÍSICAS · DISPONIBLE</span>
        <span className="text-[10px] opacity-80">una fuente por plaza · var vs cierre publicado anterior</span>
      </div>
      {cols.length === 0 ? (
        <p className="px-3 py-3 text-[11px] opacity-50">sin dato de plazas físicas (fuentes no respondieron)</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 align-top">
                <th className="w-16 px-3 py-2" />
                {cols.map((c) => (
                  <th key={c.id} className="px-3 py-2 font-normal">
                    <div className="text-[11px] font-bold text-[#0b1f3a]">{c.titulo}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] opacity-80">
                      <span className="opacity-60">
                        {c.any?.url ? (
                          <a href={c.any.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2">
                            {c.any.fuente}
                          </a>
                        ) : (
                          c.any?.fuente
                        )}
                        {" · "}
                        {c.any?.hora}
                      </span>
                      <ViejoBadge r={c.any} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["soja", "maiz", "trigo"] as const).map((g, gi) => (
                <tr key={g} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2">
                    {tema !== "base" ? (
                      <span className="text-[10px]"><GrainLabel grano={g} /></span>
                    ) : (
                      <span className="text-[10px] font-bold tracking-wide" style={{ color: CROP[g].accent }}>
                        {CROP[g].label}
                      </span>
                    )}
                  </td>
                  {cols.map((c) => (
                    <td key={c.id} className="px-3 py-2">
                      <PlazaCell r={c.rows[gi]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] leading-snug opacity-70">
        CAC, AFA y ACA publican en ARS/t (ACA: sólo disponible en $; si no hay, &quot;sin referencia&quot;); US$ ≈ conversión a {tcNotes.length ? tcNotes.join(" · ") : "BNA divisa comprador de la fecha del dato (sin TC de esa fecha → sólo ARS)"}.
        {" "}&quot;viejo&quot; = 1–3 días hábiles de atraso; más de 3 no se muestra.
      </div>
    </section>
  );
}



function ClimaCountry({ e }: { e: ClimaEntry }) {
  const flagEmoji =
    e.country === "AR" ? "🇦🇷" : e.country === "BR" ? "🇧🇷" : "🇺🇸";
  return (
    <div className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-[#0b1f3a]">
          <span className="text-[14px] leading-none" aria-hidden>
            {flagEmoji}
          </span>
          <span>
            {e.country} · {e.countryLabel}
          </span>
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
    return `Matba ${r.producto}`;
  }
  if (r.id.startsWith("cac-")) {
    return `Pizarra CAC ${r.producto}`;
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

export default function MarketBoard({ mercado, tema = "base" }: { mercado: MercadoSnapshot; tema?: Tema }) {
  const sojaChi = rowById(mercado.rows, "chicago-soja");
  const maizChi = rowById(mercado.rows, "chicago-maiz");
  const trigoChi = rowById(mercado.rows, "chicago-trigo");

  const sojaMay = rowById(mercado.rows, "matba-soja-may");
  const sojaNov = rowById(mercado.rows, "matba-soja-nov");
  const maizMat = rowById(mercado.rows, "matba-maiz");
  const trigoMat = rowById(mercado.rows, "matba-trigo");

  const sojaCac = rowById(mercado.rows, "cac-soja");

  const usda = rowById(mercado.rows, "usda");
  const progress = rowById(mercado.rows, "crop-progress");
  const noticias = rowById(mercado.rows, "noticias");
  const noticiasItems = (mercado.noticias?.ok ? mercado.noticias.items : []).slice(0, 5);
  const wti = rowById(mercado.rows, "wti");

  return (
    <div className="flex flex-col gap-3">
      <PlazasBlock mercado={mercado} tema={tema} />

      {/* Row A */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Panel title="Chicago · futuro CBOT (Yahoo)">
          <CropLine crop="soja" r={sojaChi} tema={tema} />
          <CropLine crop="maiz" r={maizChi} tema={tema} />
          <CropLine crop="trigo" r={trigoChi} tema={tema} />
        </Panel>

        <Panel title="Matba · futuros" tint="#0b1f3a">
          <div className="flex items-start gap-2 border-l-4 border-[#1f6b3a] pl-2">
            {tema !== "base" ? (
              <span className="w-16 shrink-0 pt-0.5 text-[10px]"><GrainLabel grano="soja" /></span>
            ) : (
              <span className="w-14 shrink-0 pt-0.5 text-[10px] font-bold text-[#1f6b3a]">
                SOJA
              </span>
            )}
            <div className="grid w-full grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] opacity-50">May</div>
                <Cell r={sojaMay} dense />
              </div>
              <div>
                <div className="text-[9px] opacity-50">Nov</div>
                <Cell r={sojaNov} dense />
              </div>
            </div>
          </div>
          <CropLine crop="maiz" r={maizMat} tema={tema} />
          <CropLine crop="trigo" r={trigoMat} tema={tema} />
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

        {tema !== "base" ? (
          <NoticiasUi items={noticiasItems} fallback={noticias?.valor ?? null} />
        ) : (
        <Panel title="Noticias">
          {noticiasItems.length > 0 ? (
            <ol className="flex flex-col gap-1.5">
              {noticiasItems.map((it, i) => (
                <li key={it.url ?? i} className="text-[11px] leading-snug">
                  {it.url ? (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                    >
                      {it.title || it.text}
                    </a>
                  ) : (
                    <span>{it.title || it.text}</span>
                  )}
                  <span className="block text-[9px] opacity-50">
                    {[it.source || it.handle, it.publishedAtArg]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          ) : noticias?.valor ? (
            <p className="text-[11px] leading-snug opacity-60">{noticias.valor}</p>
          ) : (
            <p className="text-[11px] opacity-40">— sin fuente</p>
          )}
        </Panel>
        )}

        <Panel title="Clima AR / BR / US">
          <ClimaBlock mercado={mercado} />
        </Panel>
      </div>

      {/* Señales */}
      {tema !== "base" ? (
        <TradingBoard rows={[sojaChi, maizChi, trigoChi, sojaMay ?? sojaNov, sojaCac, wti]} />
      ) : (
      <section className="digest-panel">
        <h3 className="digest-panel-title">Tablero señales</h3>
        <p className="mb-1.5 text-[10px] opacity-55">
          Cada chip: plaza + tipo (futuro / disponible) + fuente.
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
      )}
    </div>
  );
}
