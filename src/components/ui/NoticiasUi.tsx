import type { NoticiasItem } from "@/lib/types";

/**
 * Noticias estilo terminal: fondo oscuro, hora en naranja, fuente en etiqueta y franja
 * de color según tema. El snapshot no trae campo de tema → se asigna por palabras clave
 * (en este orden); si no queda claro, gris.
 */
type TemaNoticia = "clima" | "politica" | "internacional" | "mercado" | "otro";

const TEMA: Record<TemaNoticia, { color: string; label: string }> = {
  mercado: { color: "#3b82f6", label: "Mercado" },
  clima: { color: "#38bdf8", label: "Clima" },
  politica: { color: "#f97316", label: "Política y economía" },
  internacional: { color: "#a855f7", label: "Internacional" },
  otro: { color: "#6b7280", label: "Sin tema" },
};

const KW: Array<[TemaNoticia, RegExp]> = [
  ["clima", /\b(clima|lluvia|lluvias|sequ[ií]a|helada|heladas|ni[ñn]a|ni[ñn]o|tormenta|granizo|inundaci|temperatura|precipitaci|smn)/i],
  ["politica", /\b(gobierno|retenci|derechos de exportaci|arca|afip|impuest|milei|caputo|ministerio|decreto|ley\b|congreso|inflaci|bcra|econom[ií]a|fiscal|resoluci[oó]n|senasa|elecci)/i],
  ["internacional", /\b(china|ee\.?\s?uu\.?|estados unidos|trump|xi\b|brasil|brasile|europa|uni[oó]n europea|india|rusia|ucrania|usda|internacional)/i],
  ["mercado", /\b(precio|precios|mercado|compras?|ventas?|export|import|cosecha|siembra|soja|ma[ií]z|trigo|girasol|cotizaci|demanda|oferta|stock|embarque|puerto)/i],
];

export function temaNoticia(it: NoticiasItem): TemaNoticia {
  const t = `${it.title ?? ""} ${it.text ?? ""}`;
  for (const [k, re] of KW) if (re.test(t)) return k;
  return "otro";
}

/** "Agri-Pulse · traducido del inglés" → "Agri-Pulse" (la nota de traducción va aparte) */
function fuenteCorta(s: string | null | undefined): { fuente: string; nota: string | null } {
  const [f, ...rest] = (s ?? "").split(" · ");
  return { fuente: f || "", nota: rest.join(" · ") || null };
}

export default function NoticiasUi({ items, fallback }: { items: NoticiasItem[]; fallback: string | null }) {
  return (
    <section className="noticias-ui zona-oscura flex flex-col rounded p-2.5">
      <h3 className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">
        <span>Noticias</span>
        <span className="flex gap-1.5 text-[8px] font-normal normal-case tracking-normal text-slate-400">
          {(["mercado", "clima", "politica", "internacional"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-0.5">
              <span className="inline-block h-2 w-1 rounded-sm" style={{ background: TEMA[k].color }} aria-hidden />
              {TEMA[k].label}
            </span>
          ))}
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400">{fallback ?? "— sin fuente"}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((it, i) => {
            const t = TEMA[temaNoticia(it)];
            const { fuente, nota } = fuenteCorta(it.source || it.handle);
            return (
              <li key={it.url ?? i} className="border-l-[3px] pl-2" style={{ borderColor: t.color }} title={t.label}>
                <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                  {it.publishedAtArg ? <span className="font-mono font-bold text-orange-400">{it.publishedAtArg}</span> : null}
                  {fuente ? (
                    <span className="rounded-sm bg-slate-700 px-1 py-px font-semibold uppercase tracking-wide text-slate-100">{fuente}</span>
                  ) : null}
                  {nota ? <span className="text-slate-500">{nota}</span> : null}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-100">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {it.title || it.text}
                    </a>
                  ) : (
                    it.title || it.text
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
