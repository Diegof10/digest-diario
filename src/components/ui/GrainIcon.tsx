/**
 * Íconos de grano (SVG inline propio, sin imágenes externas). Sólo decoran:
 * aria-hidden, no agregan datos. Soja verde, maíz amarillo, trigo dorado,
 * girasol y sorgo por si aparecen.
 */
export type GrainKey = "soja" | "maiz" | "trigo" | "girasol" | "sorgo";

export const GRAIN_COLOR: Record<GrainKey, string> = {
  soja: "#2e9e4f",
  maiz: "#f2c200",
  trigo: "#c9a227",
  girasol: "#f59e0b",
  sorgo: "#b5532e",
};

export const GRAIN_LABEL: Record<GrainKey, string> = {
  soja: "Soja",
  maiz: "Maíz",
  trigo: "Trigo",
  girasol: "Girasol",
  sorgo: "Sorgo",
};

export function grainFromText(s: string | null | undefined): GrainKey | null {
  const n = (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/soja/.test(n)) return "soja";
  if (/maiz/.test(n)) return "maiz";
  if (/trigo/.test(n)) return "trigo";
  if (/girasol/.test(n)) return "girasol";
  if (/sorgo/.test(n)) return "sorgo";
  return null;
}

export function GrainIcon({ grano, className = "h-4 w-4" }: { grano: GrainKey; className?: string }) {
  const c = GRAIN_COLOR[grano];
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true, focusable: false } as const;
  switch (grano) {
    case "soja":
      // Vaina con tres porotos
      return (
        <svg {...common}>
          <path d="M4 17c0-6 5-12 12-13 2 0 4 1 4 3-1 7-7 13-13 13-2 0-3-1-3-3Z" fill={c} opacity="0.25" />
          <path d="M4 17c0-6 5-12 12-13 2 0 4 1 4 3-1 7-7 13-13 13-2 0-3-1-3-3Z" fill="none" stroke={c} strokeWidth="1.6" />
          <circle cx="15.5" cy="8.5" r="2" fill={c} />
          <circle cx="12" cy="12" r="2" fill={c} />
          <circle cx="8.5" cy="15.5" r="2" fill={c} />
        </svg>
      );
    case "maiz":
      // Choclo con hojas
      return (
        <svg {...common}>
          <ellipse cx="12" cy="10" rx="4.2" ry="7.5" fill={c} />
          <path d="M9 6h6M8.2 9h7.6M8.2 12h7.6M9 15h6M12 3v14" stroke="#8a6d00" strokeWidth="0.8" opacity="0.6" />
          <path d="M12 22c-4-1-7-5-7-10 2 2 4 5 7 6M12 22c4-1 7-5 7-10-2 2-4 5-7 6" fill="#3f8f3a" />
        </svg>
      );
    case "trigo":
      // Espiga
      return (
        <svg {...common}>
          <path d="M12 22V6" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
          {[7, 11, 15].map((y) => (
            <g key={y} fill={c}>
              <ellipse cx="9.3" cy={y} rx="2.6" ry="1.5" transform={`rotate(-35 9.3 ${y})`} />
              <ellipse cx="14.7" cy={y} rx="2.6" ry="1.5" transform={`rotate(35 14.7 ${y})`} />
            </g>
          ))}
          <ellipse cx="12" cy="4" rx="1.4" ry="2.2" fill={c} />
        </svg>
      );
    case "girasol":
      return (
        <svg {...common}>
          {Array.from({ length: 10 }, (_, i) => (
            <ellipse key={i} cx="12" cy="4.5" rx="1.8" ry="3.2" fill={c} transform={`rotate(${i * 36} 12 12)`} />
          ))}
          <circle cx="12" cy="12" r="4.2" fill="#5b3a1a" />
        </svg>
      );
    case "sorgo":
      return (
        <svg {...common}>
          <path d="M12 22V13" stroke="#3f8f3a" strokeWidth="1.6" strokeLinecap="round" />
          {[
            [12, 4], [9.5, 6], [14.5, 6], [8.5, 9], [12, 8], [15.5, 9], [10, 11.5], [14, 11.5], [12, 11],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.8" fill={c} />
          ))}
        </svg>
      );
  }
}

/** Ícono + nombre del grano (el nombre es el dato; el ícono decora). */
export function GrainLabel({
  grano,
  upper = true,
  className = "",
}: {
  grano: GrainKey;
  upper?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tracking-wide ${className}`} style={{ color: GRAIN_COLOR[grano] }}>
      <GrainIcon grano={grano} className="h-4 w-4 shrink-0" />
      <span className="grain-name">{upper ? GRAIN_LABEL[grano].toUpperCase() : GRAIN_LABEL[grano]}</span>
    </span>
  );
}
