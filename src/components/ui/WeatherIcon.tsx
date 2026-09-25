/** Ícono de clima según weather_code WMO de Open-Meteo. Sólo decora (aria-hidden). */
export type WeatherKind = "sol" | "parcial" | "nube" | "niebla" | "lluvia" | "tormenta" | "nieve";

export function weatherKind(code: number | null | undefined): WeatherKind | null {
  if (code == null) return null;
  if (code === 0 || code === 1) return "sol";
  if (code === 2) return "parcial";
  if (code === 3) return "nube";
  if (code === 45 || code === 48) return "niebla";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "lluvia";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "nieve";
  if (code >= 95) return "tormenta";
  return null;
}

const Cloud = ({ fill = "#cbd5e1", y = 0 }: { fill?: string; y?: number }) => (
  <path
    d={`M7 ${18 + y}h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.3 3.3 0 0 0 7 ${18 + y}Z`}
    fill={fill}
  />
);

export function WeatherIcon({ code, className = "h-10 w-10" }: { code: number | null | undefined; className?: string }) {
  const k = weatherKind(code);
  if (!k) return null;
  const sun = (cx: number, cy: number, r: number) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy - r - 1.5}
          x2={cx}
          y2={cy - r - 3.5}
          stroke="#f59e0b"
          strokeWidth="1.6"
          strokeLinecap="round"
          transform={`rotate(${i * 45} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="#fbbf24" />
    </g>
  );
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {k === "sol" && sun(12, 12, 4.5)}
      {k === "parcial" && (
        <>
          {sun(9, 9, 3.5)}
          <Cloud y={1} />
        </>
      )}
      {k === "nube" && <Cloud fill="#94a3b8" y={-1} />}
      {k === "niebla" && (
        <g stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round">
          <line x1="4" y1="8" x2="20" y2="8" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="4" y1="16" x2="20" y2="16" />
        </g>
      )}
      {k === "lluvia" && (
        <>
          <Cloud fill="#94a3b8" y={-4} />
          <g stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round">
            <line x1="8" y1="17" x2="7" y2="20" />
            <line x1="12" y1="17" x2="11" y2="20" />
            <line x1="16" y1="17" x2="15" y2="20" />
          </g>
        </>
      )}
      {k === "tormenta" && (
        <>
          <Cloud fill="#64748b" y={-4} />
          <path d="M12.5 14.5 9.5 19h2.5l-1 3.5 3.5-5h-2.5l1.5-3Z" fill="#facc15" />
        </>
      )}
      {k === "nieve" && (
        <>
          <Cloud fill="#cbd5e1" y={-4} />
          <g fill="#e0f2fe">
            <circle cx="8" cy="18.5" r="1.2" />
            <circle cx="12" cy="20" r="1.2" />
            <circle cx="16" cy="18.5" r="1.2" />
          </g>
        </>
      )}
    </svg>
  );
}
