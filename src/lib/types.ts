/** Tipos del digest diario. */

export type EtiquetaDato = "HECHO" | "ÚLTIMO_GUARDADO" | "VACÍO" | "SUPUESTO";

export type SenalMercado = "↑" | "↓" | "→";

export interface CatacTarifa {
  km: number;
  arsPerTon: number;
}

export interface CatacSnapshot {
  ok: boolean;
  mes: string | null;
  mesLabel: string | null;
  mesShort: string | null;
  staleVsCalendar: boolean;
  statusLabel: string;
  pdfUrl: string | null;
  mediaId: number | null;
  tarifas: CatacTarifa[];
  /** ARS/t para el km pedido; null si no hay tarifa o no se pasó km */
  arsPerTon: number | null;
  km: number | null;
  parseOk: boolean;
  parseNote: string;
  fetchedAt: string;
  fuente: "live" | "fallback" | "none";
}

export interface MercadoRow {
  id: string;
  mercado: string;
  producto: string;
  valor: string | null;
  unidad: string | null;
  fuente: string | null;
  hora: string | null;
  etiqueta: EtiquetaDato;
  /** Variación decimal (−0.01 = −1%); null si no hay */
  varPct?: number | null;
  senal?: SenalMercado | null;
  /** Hint ¢/bu u otro detalle */
  extra?: string | null;
  contrato?: string | null;
  /** URL fuente (clima / reportes) */
  url?: string | null;
}

export interface ClimaEntry {
  country: "AR" | "BR" | "US";
  countryLabel: string;
  bullet: string;
  fuente: string;
  /** Fecha de referencia de la fuente (ej. ago-2026, 10/9/2026) */
  fecha: string;
  url: string;
  secondaryUrl?: string | null;
  secondaryNote?: string | null;
  etiqueta: EtiquetaDato;
}

export interface ClimaSnapshot {
  ok: boolean;
  entries: ClimaEntry[];
  note: string;
  fetchedAt: string;
  fuente: "live" | "snapshot";
  etiqueta: EtiquetaDato;
}


export interface NoticiasItem {
  handle: string;
  text: string;
  url?: string | null;
  likes?: number | null;
  views?: number | null;
  reposts?: number | null;
  publishedAt?: string | null;
  publishedAtArg?: string | null;
  metricsUnavailable?: boolean;
  relevance?: number | null;
}

export interface NoticiasSnapshot {
  ok: boolean;
  valor: string | null;
  fuente: string | null;
  hora: string | null;
  url: string | null;
  extra: string | null;
  etiqueta: EtiquetaDato;
  items: NoticiasItem[];
  note: string;
  fetchedAt: string;
  asOf: string | null;
  maxAgeHours: number;
}

export interface MercadoSnapshot {
  ok: boolean;
  rows: MercadoRow[];
  note: string;
  fetchedAt: string;
  asOf?: string | null;
  fxBna?: number | null;
  wasdeHeadline?: string | null;
  progressHeadline?: string | null;
  sourcesOk?: string[];
  /** Clima AR/BR/US estructurado (texto + link + fecha; sin heatmap) */
  clima?: ClimaSnapshot | null;
  /** Noticias X / agro — snapshot fechado; vacío si no hay posts frescos */
  noticias?: NoticiasSnapshot | null;
}

export interface FiscalNovedad {
  texto: string;
  fuente: string | null;
}

export interface FiscalVencimiento {
  concepto: string;
  ventana: string;
  detalle?: string | null;
  fuente?: string | null;
}

export interface FiscalSnapshot {
  ok: boolean;
  /** Una línea: novedad concreta o "sin novedad fiscal" (compat digest/resumen) */
  novedad: string;
  fuente: string | null;
  fetchedAt: string;
  /** Fecha del snapshot (YYYY-MM-DD ARG) */
  fecha: string | null;
  actualizadoAt: string | null;
  novedades: FiscalNovedad[];
  vencimientos: FiscalVencimiento[];
  /** Línea tablero / panel (preferida sobre novedad corta) */
  lineaTablero: string;
  pie: string | null;
}

export interface CostoInsumoSlot {
  id: string;
  label: string;
  valor: string | null;
  unidad: string | null;
  fecha: string | null;
  fuente: string | null;
  etiqueta: EtiquetaDato;
}

export interface DigestSnapshot {
  ok: boolean;
  producto: "digest-diario";
  fecha: string; // YYYY-MM-DD America/Argentina/Cordoba
  fechaLabel: string;
  fechaCorta: string; // dd/mm/yyyy
  generadoAt: string;
  mercado: MercadoSnapshot;
  catac: CatacSnapshot;
  insumos: CostoInsumoSlot[];
  fiscal: FiscalSnapshot;
  /** 5–6 líneas; vacío hasta que Informe complete */
  lectura: string[];
  /** Resumen matutino (CoS txt si hay body; si no, auto-built fallback) */
  resumenMatutino: string[];
  pie: string;
}
