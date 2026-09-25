import data from "@/data/avance-bcba.json";

export type MetricaKey = "siembra" | "cosecha" | "condicion";
export type Metrica = {
  campana?: string;
  categoria?: string;
  nacional: number | null;
  areaMHa?: number;
  varSemanalPp: number | null;
  vsAnioAnteriorPp: number | null;
  notaVsAnioAnterior?: string;
  zonas: Record<string, number>;
};
export type Cultivo = { sinAvance?: boolean; metricas: Partial<Record<MetricaKey, Metrica>> };
export type Informe = {
  fecha: string;
  relevamientoAl: string | null;
  origen: "pdf" | "prensa";
  origenNota: string;
  publicado: { iso: string | null; texto: string };
  urlInforme: string;
  respaldo: string[];
  cultivos: Record<string, Cultivo>;
};
export type AvanceData = {
  fuente: string;
  fuenteUrl: string;
  geometria: { tipo: "oficial" | "aproximada"; nota: string };
  estadoDescarga: { ok: boolean; intentoISO: string; detalle: string };
  informes: Informe[];
};

export const ZONA_NOMBRES: Record<string, string> = {
  I: "NOA",
  II: "NEA",
  III: "Centro-Norte de Córdoba",
  IV: "Sur de Córdoba",
  V: "Centro-Norte de Santa Fe",
  VI: "Núcleo Norte",
  VII: "Núcleo Sur",
  VIII: "Centro-Este de Entre Ríos",
  IX: "Norte de La Pampa - Oeste de Bs. As.",
  X: "Centro de Buenos Aires",
  XI: "Sudoeste de Bs. As. - Sur de La Pampa",
  XII: "Sudeste de Buenos Aires",
  XIII: "San Luis",
  XIV: "Cuenca del Salado",
  XV: "Corrientes - Misiones",
};

/** Días (calendario ART) entre la fecha del informe y hoy. */
export function diasDesde(fechaISO: string, now = new Date()): number {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(now);
  const a = Date.UTC(+fechaISO.slice(0, 4), +fechaISO.slice(5, 7) - 1, +fechaISO.slice(8, 10));
  const b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function loadAvance(): AvanceData & { dias: number; viejo: boolean } {
  const d = data as AvanceData;
  const dias = d.informes.length ? diasDesde(d.informes[0].fecha) : 999;
  return { ...d, dias, viejo: dias > 8 };
}
