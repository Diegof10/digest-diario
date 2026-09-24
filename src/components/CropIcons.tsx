/** Íconos line-art estilo placa cierre (soja / maíz / trigo). */

type IconProps = { className?: string; color?: string };

export function SojaIcon({ className = "h-6 w-6", color = "#1f6b3a" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path
        d="M16 4c-3.5 4-6 8.5-6 13a6 6 0 0 0 12 0c0-4.5-2.5-9-6-13Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14" r="2.2" fill={color} opacity="0.85" />
      <circle cx="13.2" cy="18.5" r="2" fill={color} opacity="0.7" />
      <circle cx="18.8" cy="18.5" r="2" fill={color} opacity="0.7" />
    </svg>
  );
}

export function MaizIcon({ className = "h-6 w-6", color = "#e67e22" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path
        d="M16 3c3.2 2.2 5 5.8 5 10.2 0 5.5-2.2 10.5-5 14.8-2.8-4.3-5-9.3-5-14.8C11 8.8 12.8 5.2 16 3Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 7v18" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <path
        d="M12.5 11h7M12.2 15h7.6M12.5 19h7"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M10 8c-2 1.5-3 3.5-3 5.5M22 8c2 1.5 3 3.5 3 5.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

export function TrigoIcon({ className = "h-6 w-6", color = "#c9a227" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M16 28V10" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M16 12c-2.2-1.6-4.2-2-5.5-1.6 1.2 1.8 3.2 3 5.5 3.4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 12c2.2-1.6 4.2-2 5.5-1.6-1.2 1.8-3.2 3-5.5 3.4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 16c-2.4-1.5-4.4-1.8-5.8-1.3 1.3 1.7 3.4 2.8 5.8 3.1"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 16c2.4-1.5 4.4-1.8 5.8-1.3-1.3 1.7-3.4 2.8-5.8 3.1"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 20c-2.2-1.2-4-1.4-5.2-1 1.2 1.4 3 2.3 5.2 2.6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 20c2.2-1.2 4-1.4 5.2-1-1.2 1.4-3 2.3-5.2 2.6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="16" cy="9" rx="1.8" ry="2.4" fill={color} opacity="0.9" />
    </svg>
  );
}

export const CROP_META = {
  soja: { label: "Soja", color: "#1f6b3a", Icon: SojaIcon },
  maiz: { label: "Maíz", color: "#e67e22", Icon: MaizIcon },
  trigo: { label: "Trigo", color: "#c9a227", Icon: TrigoIcon },
} as const;

export type CropKey = keyof typeof CROP_META;
