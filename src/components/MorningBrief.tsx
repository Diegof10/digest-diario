import { CROP_META, type CropKey } from "@/components/CropIcons";
import { GRAIN_COLOR, GrainIcon } from "@/components/ui/GrainIcon";
import type { Tema } from "@/lib/tema";
import {
  changeTone,
  parseResumenVisual,
  type CropQuote,
  type PlazaBlock,
} from "@/lib/parse-resumen-visual";

function ChangeBadge({ change }: { change?: string }) {
  if (!change) return null;
  const tone = changeTone(change);
  const cls =
    tone === "up"
      ? "text-[#1f6b3a] bg-[#1f6b3a]/10"
      : tone === "down"
        ? "text-[#b91c1c] bg-[#b91c1c]/10"
        : "text-slate-500 bg-slate-100";
  return (
    <span className={`rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>
      {change}
    </span>
  );
}

function QuoteCell({ q }: { q?: CropQuote }) {
  if (!q) {
    return <span className="text-[11px] opacity-30">—</span>;
  }
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-bold tabular-nums leading-tight text-[#0b1f3a]">
        {q.price}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {q.unit ? (
          <span className="text-[9px] text-slate-500">{q.unit}</span>
        ) : null}
        <ChangeBadge change={q.change} />
      </div>
    </div>
  );
}

function CropRow({
  crop,
  byPlaza,
  plazas,
  tema = "base",
}: {
  crop: CropKey;
  byPlaza: Record<string, CropQuote | undefined>;
  plazas: PlazaBlock[];
  tema?: Tema;
}) {
  const ui = tema !== "base";
  const meta = ui ? { ...CROP_META[crop], color: GRAIN_COLOR[crop] } : CROP_META[crop];
  const Icon = ui
    ? ({ className }: { className?: string; color?: string }) => <GrainIcon grano={crop} className={className} />
    : meta.Icon;
  return (
    <div className="flex items-stretch gap-2 border-b border-slate-100 py-2 last:border-0 sm:gap-3">
      <div
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ background: meta.color }}
        aria-hidden
      />
      <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 sm:w-16">
        <Icon className="h-7 w-7" color={meta.color} />
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
      </div>
      <div
        className="grid flex-1 gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(plazas.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {plazas.map((p) => (
          <QuoteCell key={p.plaza} q={byPlaza[p.plaza]} />
        ))}
      </div>
    </div>
  );
}

export default function MorningBrief({ lines, tema = "base" }: { lines: string[]; tema?: Tema }) {
  const { plazas, extras } = parseResumenVisual(lines);
  const crops: CropKey[] = ["soja", "maiz", "trigo"];

  // index quotes by plaza+crop
  const index = new Map<string, CropQuote>();
  for (const p of plazas) {
    for (const q of p.quotes) {
      index.set(`${p.plaza}:${q.crop}`, q);
    }
  }

  const grainPlazas = plazas.filter((p) =>
    p.quotes.some((q) => crops.includes(q.crop)),
  );

  return (
    <section className="digest-panel">
      <h3 className="digest-panel-title">Resumen matutino</h3>
      <p className="-mt-1 mb-1.5 text-[9px] opacity-50">
        AFA (pizarra AFA SCL) · CAC (Cámara Arbitral BCR): feed vivo, var vs cierre publicado anterior de la misma fuente.
      </p>

      {grainPlazas.length > 0 ? (
        <>
          <div
            className="mb-1 grid gap-2 pl-[calc(0.25rem+4.5rem+0.5rem)] text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:pl-[calc(0.25rem+4rem+0.75rem)]"
            style={{
              gridTemplateColumns: `repeat(${grainPlazas.length}, minmax(0, 1fr))`,
            }}
          >
            {grainPlazas.map((p) => (
              <div key={p.plaza}>
                <span className="text-[#0b1f3a]/70">{p.plaza}</span>
                {p.detail ? (
                  <span className="ml-1 font-normal normal-case tracking-normal opacity-70">
                    {p.detail.replace(/\s*·\s*viejo/i, "")}
                  </span>
                ) : null}
                {p.detail && /viejo/i.test(p.detail) ? (
                  <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[9px] font-bold normal-case tracking-normal text-amber-800">
                    viejo
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div>
            {crops.map((crop) => {
              const byPlaza: Record<string, CropQuote | undefined> = {};
              for (const p of grainPlazas) {
                byPlaza[p.plaza] = index.get(`${p.plaza}:${crop}`);
              }
              return (
                <CropRow
                  key={crop}
                  crop={crop}
                  byPlaza={byPlaza}
                  plazas={grainPlazas}
                  tema={tema}
                />
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-[11px] opacity-40">— sin precios de cultivo en el brief</p>
      )}

      {extras.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {extras.map((line, i) => (
            <p
              key={i}
              className="rounded bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-[#0b1f3a]/85"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
