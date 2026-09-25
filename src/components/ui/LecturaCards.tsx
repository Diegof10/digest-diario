"use client";

import { useEffect, useRef, useState } from "react";
import type { CardSection, LecturaCard } from "@/lib/lectura-cards";
import { GrainIcon } from "@/components/ui/GrainIcon";
import { WeatherIcon } from "@/components/ui/WeatherIcon";

function DolarIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#34d399" strokeWidth="1.6" />
      <path
        d="M14.8 8.6c-.6-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.9-2.8 2.2 0 3 5.7 1.6 5.7 4.6 0 1.4-1.3 2.4-3 2.4-1.3 0-2.4-.6-3-1.5M12 5.5v13"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Icon({ card }: { card: LecturaCard }) {
  const cls = "h-6 w-6 shrink-0";
  if (card.icon.kind === "grano") return <GrainIcon grano={card.icon.grano} className={cls} />;
  if (card.icon.kind === "clima") {
    return card.icon.code != null ? (
      <WeatherIcon code={card.icon.code} className={cls} />
    ) : (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden><circle cx="12" cy="12" r="5" fill="#64748b" /></svg>
    );
  }
  return <DolarIcon className={cls} />;
}

function Arrow({ s }: { s: CardSection }) {
  const [ch, cls] =
    s.flecha === "up" ? ["▲", "text-emerald-400"] : s.flecha === "down" ? ["▼", "text-red-400"] : ["●", "text-slate-500"];
  return (
    <span className={`shrink-0 text-[11px] ${cls}`} role="img" aria-label={s.flechaLabel}>
      {ch}
    </span>
  );
}

function Detalle({ card, id, className }: { card: LecturaCard; id: string; className: string }) {
  return (
    <div id={id} role="region" aria-label={`Lectura ${card.sections[0].titulo}`} className={className}>
      {card.sections.map((s, i) => (
        <div key={i} className={i > 0 ? "mt-2 border-t border-slate-700 pt-2" : ""}>
          {card.sections.length > 1 ? (
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-300">
              <Arrow s={s} />
              {s.titulo}
            </p>
          ) : null}
          <p className="text-[12px] leading-snug text-slate-100">{s.resumen}</p>
          <p className="mt-1 font-mono text-[9px] text-slate-400">
            {[s.fuente, s.hora].filter(Boolean).join(" · ") || "sin fuente"}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Fila de tarjetas de lectura. Desktop: hover abre popover. Mobile/teclado: tap o Enter
 * abre/cierra (button + aria-expanded); Esc cierra. En celular el detalle se abre en línea
 * a lo ancho de la grilla (2 columnas, sin scroll horizontal).
 */
export default function LecturaCards({ cards }: { cards: LecturaCard[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openId) btns.current[openId]?.focus();
      setOpenId(null);
      setHoverId(null);
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [openId]);

  const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return (
    <section className="lectura-cards zona-oscura rounded p-2.5" aria-label="Lectura del día">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">Lectura</h3>
      <div ref={root} className="grid grid-flow-row-dense grid-cols-2 gap-1.5 md:grid-cols-5">
        {cards.map((c, idx) => {
          const open = openId === c.id || hoverId === c.id;
          const last = idx === cards.length - 1;
          const detId = `lc-${c.id}`;
          return (
            <div
              key={c.id}
              className={`relative ${last ? "col-span-2 md:col-span-1" : ""}`}
              onMouseEnter={() => canHover() && setHoverId(c.id)}
              onMouseLeave={() => setHoverId((h) => (h === c.id ? null : h))}
            >
              <button
                ref={(el) => {
                  btns.current[c.id] = el;
                }}
                type="button"
                aria-expanded={open}
                aria-controls={`${detId}-m ${detId}-d`}
                onClick={() => setOpenId((o) => (o === c.id ? null : c.id))}
                className={`flex h-full w-full items-start gap-2 rounded-sm border bg-black px-2 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                  open ? "border-orange-400/70" : "border-slate-800 hover:border-slate-600"
                }`}
              >
                <Icon card={c} />
                <span className="flex min-w-0 flex-col gap-1">
                  {/* La tarjeta muestra el título de la primera sección (Dólar/Fiscal: el dólar);
                      el popover muestra todas. */}
                  <span className="flex items-start gap-1">
                    <Arrow s={c.sections[0]} />
                    <span className="text-[11px] font-semibold leading-tight text-slate-100">{c.sections[0].titulo}</span>
                  </span>
                  {c.sections.length > 1 ? (
                    <span className="text-[9px] leading-tight text-slate-400">+ {c.sections.slice(1).map((s) => s.titulo).join(" · ")}</span>
                  ) : null}
                </span>
              </button>
              {open ? (
                <Detalle
                  card={c}
                  id={`${detId}-d`}
                  className={`absolute top-full z-30 mt-1 hidden w-72 rounded border border-slate-700 bg-[#0b0f14] p-2.5 shadow-xl md:block ${
                    idx >= 3 ? "right-0" : "left-0"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
        {/* Detalle en línea para celular: fila completa debajo de la grilla abierta */}
        {cards.map((c) =>
          openId === c.id ? (
            <Detalle
              key={`m-${c.id}`}
              card={c}
              id={`lc-${c.id}-m`}
              className="col-span-2 rounded border border-slate-700 bg-[#0b0f14] p-2.5 md:hidden"
            />
          ) : null,
        )}
      </div>
    </section>
  );
}
