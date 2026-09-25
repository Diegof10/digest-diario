import type { TickerItem } from "@/lib/ticker";
import { GrainIcon } from "@/components/ui/GrainIcon";

function Var({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return null;
  const pct = Math.abs(v * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (pct === "0,0") return <span className="tk-flat">= 0,0%</span>;
  return v > 0 ? <span className="tk-up">▲{pct}%</span> : <span className="tk-down">▼{pct}%</span>;
}

function Item({ it }: { it: TickerItem }) {
  return (
    <span className="tk-item">
      {it.grano ? <GrainIcon grano={it.grano} className="h-3.5 w-3.5" /> : null}
      <span className="tk-label">{it.label}</span>
      <span className="tk-num">{it.valor}</span>
      <Var v={it.varPct} />
      <span className="tk-when">· {it.cuando}</span>
    </span>
  );
}

/** Cinta desplazable. Con prefers-reduced-motion queda quieta y se desplaza a mano. */
export default function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ticker zona-oscura" role="region" aria-label="Cinta de precios (datos demorados o de cierre)">
      <div className="ticker-track">
        <div className="ticker-group">
          {items.map((it) => (
            <Item key={it.id} it={it} />
          ))}
        </div>
        <div className="ticker-group" aria-hidden>
          {items.map((it) => (
            <Item key={`d-${it.id}`} it={it} />
          ))}
        </div>
      </div>
    </div>
  );
}
