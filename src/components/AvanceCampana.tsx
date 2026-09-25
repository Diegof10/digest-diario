"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import geo from "@/data/zonas-bcba-svg.json";
import type { AvanceData, Informe, Metrica, MetricaKey } from "@/lib/avance";
import { ZONA_NOMBRES } from "@/lib/avance";

type Props = { data: AvanceData; viejo: boolean; dias: number };

const CULTIVOS: { key: string; label: string }[] = [
  { key: "maiz", label: "Maíz" },
  { key: "girasol", label: "Girasol" },
  { key: "trigo", label: "Trigo" },
  { key: "soja", label: "Soja" },
];
// v1: maíz y girasol = siembra; trigo = condición; soja = sin avance (nunca 0%)
const METRICAS_V1: Record<string, MetricaKey[]> = { maiz: ["siembra"], girasol: ["siembra"], trigo: ["condicion"], soja: ["siembra"] };
const ORDEN_METRICA: MetricaKey[] = ["siembra", "cosecha", "condicion"];
const METRICA_LABEL: Record<MetricaKey, string> = { siembra: "siembra", cosecha: "cosecha", condicion: "condición" };

// escala: más oscuro = más avance
const ESCALA = ["#ecfccb", "#bef264", "#84cc16", "#4d7c0f", "#365314"];
const SIN_DATO = "#374151";
function colorDe(v: number | undefined) {
  if (v == null) return SIN_DATO;
  const i = Math.min(ESCALA.length - 1, Math.floor(v / 20));
  return ESCALA[i];
}

const fmt = (v: number, d = 1) => v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPp = (v: number | null) => (v == null ? "s/d" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))} pp`);
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function metricasDe(inf: Informe, cultivo: string): MetricaKey[] {
  const c = inf.cultivos[cultivo];
  if (!c) return [];
  return ORDEN_METRICA.filter((k) => (METRICAS_V1[cultivo] ?? []).includes(k) && c.metricas[k]?.nacional != null);
}

function labelBoton(inf: Informe, cultivo: string): string {
  const c = inf.cultivos[cultivo];
  if (!c) return "s/d";
  if (c.sinAvance) return "sin avance esta semana";
  const ms = metricasDe(inf, cultivo);
  return ms.length ? ms.map((m) => METRICA_LABEL[m]).join(" / ") : "s/d";
}

export default function AvanceCampana({ data, viejo, dias }: Props) {
  const [infIdx, setInfIdx] = useState(0);
  const inf = data.informes[infIdx];
  const [cultivo, setCultivo] = useState("maiz");
  const [metrica, setMetrica] = useState<MetricaKey>("siembra");
  const [zonaSel, setZonaSel] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const disponibles = useMemo(() => metricasDe(inf, cultivo), [inf, cultivo]);
  const metricaActiva: MetricaKey | null = disponibles.includes(metrica) ? metrica : disponibles[0] ?? null;
  const c = inf.cultivos[cultivo];
  const m: Metrica | undefined = metricaActiva ? c?.metricas[metricaActiva] : undefined;
  const zonas = m?.zonas ?? {};
  const nZonas = Object.keys(zonas).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZonaSel(null);
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setZonaSel(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
    };
  }, []);

  const [vbW, vbH] = geo.viewBox.split(" ").slice(2).map(Number);
  const sel = zonaSel ? geo.zonas.find((z) => z.id === zonaSel) : null;
  const selVal = zonaSel ? zonas[zonaSel] : undefined;
  const unidad =
    metricaActiva === "condicion" ? `% ${m?.categoria ?? ""}`.trim() : metricaActiva === "cosecha" ? "% del área apta" : "% del área proyectada";

  return (
    <section className="digest-panel" aria-labelledby="avance-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="avance-title" className="digest-panel-title">Avance de campaña</h3>
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {viejo ? (
            <span className="rounded-sm bg-amber-900/60 px-1.5 py-0.5 font-bold text-amber-200">viejo · {dias} días</span>
          ) : null}
          {data.informes.length > 1 ? (
            <span className="flex items-center gap-1 text-slate-400">
              informe:
              {data.informes.map((x, i) => (
                <button
                  key={x.fecha}
                  type="button"
                  onClick={() => { setInfIdx(i); setZonaSel(null); }}
                  aria-pressed={i === infIdx}
                  className={`rounded-sm px-1.5 py-0.5 font-mono ${i === infIdx ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                >
                  {x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      {/* botones por cultivo: cada uno dice qué métrica muestra */}
      <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Cultivo">
        {CULTIVOS.filter((k) => data.informes.some((x) => x.cultivos[k.key])).map((k) => {
          const on = k.key === cultivo;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setCultivo(k.key); setZonaSel(null); }}
              className={`rounded-sm border px-2 py-1 text-left text-[11px] leading-tight ${
                on ? "border-orange-400 bg-orange-500/15 text-slate-50" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              <span className="font-bold">{k.label}</span>
              <span className="block text-[9px] text-slate-400">{labelBoton(inf, k.key)}</span>
            </button>
          );
        })}
      </div>

      {disponibles.length > 1 ? (
        <div className="mt-1.5 inline-flex rounded-sm border border-slate-700 text-[10px]" role="group" aria-label="Métrica">
          {disponibles.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === metricaActiva}
              onClick={() => { setMetrica(k); setZonaSel(null); }}
              className={`px-2 py-0.5 ${k === metricaActiva ? "bg-slate-200 text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}
            >
              {METRICA_LABEL[k]} {c?.metricas[k]?.campana ?? ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_230px]">
        <div ref={boxRef} className="relative mx-auto w-full max-w-[400px]">
          <svg viewBox={geo.viewBox} className="block h-auto w-full" role="img" aria-label={`Mapa de zonas PAS: ${CULTIVOS.find((x) => x.key === cultivo)?.label} ${metricaActiva ? METRICA_LABEL[metricaActiva] : ""}`}>
            <path d={geo.provincias} fill="#111827" stroke="#1f2937" strokeWidth={0.6} />
            {geo.zonas.map((z) => {
              const v = zonas[z.id];
              const nombre = ZONA_NOMBRES[z.id] ?? z.id;
              const label = `${z.id} · ${nombre}: ${v != null ? `${fmt(v)}%` : "sin dato"}`;
              return (
                <path
                  key={z.id}
                  d={z.d}
                  fill={c?.sinAvance ? SIN_DATO : colorDe(v)}
                  stroke="#0d1117"
                  strokeWidth={0.8}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setZonaSel(z.id); }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setZonaSel(null); }}
                  onFocus={() => setZonaSel(z.id)}
                  onBlur={() => setZonaSel(null)}
                  onClick={(e) => { e.stopPropagation(); setZonaSel(z.id); }}
                  className="cursor-pointer outline-none"
                >
                  <title>{label}</title>
                </path>
              );
            })}
            {sel ? <path d={sel.d} fill="none" stroke="#fb923c" strokeWidth={2} pointerEvents="none" /> : null}
            {geo.zonas.map((z) => (
              <text key={`t${z.id}`} x={z.cx} y={z.cy} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={zonas[z.id] != null && zonas[z.id] >= 40 ? "#f1f5f9" : "#0f172a"} opacity={0.75} pointerEvents="none" fontWeight={700}>
                {z.id}
              </text>
            ))}
          </svg>
          <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
            {data.geometria.tipo === "oficial" ? "zonas PAS" : "límites aproximados"}
          </span>
          {sel ? (
            <div
              role="status"
              className="pointer-events-none absolute z-10 max-w-[70%] -translate-x-1/2 -translate-y-[120%] rounded-sm border border-slate-600 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-100 shadow-lg"
              style={{
                left: `${Math.min(80, Math.max(20, (sel.cx / vbW) * 100))}%`,
                top: `${Math.max(12, (sel.cy / vbH) * 100)}%`,
              }}
            >
              <span className="font-bold">{sel.id} · {ZONA_NOMBRES[sel.id]}</span>
              <br />
              {c?.sinAvance ? "sin avance esta semana" : selVal != null ? `${fmt(selVal)}${unidad.startsWith("%") ? unidad : ` ${unidad}`}` : "sin dato por zona"}
            </div>
          ) : null}
        </div>

        <div className="text-[11px] text-slate-300">
          {c?.sinAvance ? (
            <p className="text-lg font-bold text-slate-200">sin avance esta semana</p>
          ) : m && m.nacional != null ? (
            <>
              <p className="text-[9px] uppercase tracking-wide text-slate-400">
                Total nacional · {metricaActiva ? METRICA_LABEL[metricaActiva] : ""} {m.campana ?? ""}
              </p>
              <p className="font-mono text-3xl font-bold text-slate-50">{fmt(m.nacional)}%</p>
              <p className="text-[10px] text-slate-400">
                {unidad}
                {m.areaMHa != null ? ` (${fmt(m.areaMHa)} MHa)` : ""}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px]">
                <dt className="text-slate-400">vs semana ant.</dt>
                <dd className="text-slate-100">{fmtPp(m.varSemanalPp)}</dd>
                <dt className="text-slate-400">vs año ant.</dt>
                <dd className="text-slate-100">{fmtPp(m.vsAnioAnteriorPp)}</dd>
              </dl>
              {m.notaVsAnioAnterior ? <p className="mt-1 text-[9px] leading-snug text-slate-500">{m.notaVsAnioAnterior}</p> : null}
            </>
          ) : (
            <p className="text-lg font-bold text-slate-400">s/d en este informe</p>
          )}

          {/* leyenda */}
          <div className="mt-3" aria-label="Escala">
            <p className="mb-0.5 text-[9px] uppercase tracking-wide text-slate-400">
              {metricaActiva === "condicion" ? `${unidad} por zona` : "Avance por zona"}
            </p>
            <div className="flex">
              {ESCALA.map((col, i) => (
                <div key={col} className="flex-1">
                  <div className="h-2.5" style={{ background: col }} />
                  <div className="font-mono text-[8px] text-slate-500">{i * 20}</div>
                </div>
              ))}
              <div className="font-mono text-[8px] text-slate-500 self-end">100%</div>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400">
              <span className="inline-block h-2.5 w-3" style={{ background: SIN_DATO }} /> sin dato
            </div>
            {!c?.sinAvance && m && nZonas === 0 ? (
              <p className="mt-1 text-[9px] leading-snug text-slate-500">Este informe no trae cifras por zona para este cultivo.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-slate-800 pt-1.5 text-[9px] leading-snug text-slate-500">
        <p>
          Fuente:{" "}
          <a href={inf.urlInforme || data.fuenteUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
            {data.fuente} · informe {fechaCorta(inf.fecha)}
          </a>
          {inf.relevamientoAl ? ` · relevamiento al ${fechaCorta(inf.relevamientoAl)}` : ""} · publicado: {inf.publicado.texto}
        </p>
        <p className="mt-0.5">{inf.origenNota}</p>
        {data.geometria.tipo !== "oficial" ? <p className="mt-0.5">Límites aproximados: {data.geometria.nota}</p> : null}
      </div>
    </section>
  );
}
