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
}

export interface FiscalSnapshot {
  ok: boolean;
  /** Una línea: novedad concreta o "sin novedad fiscal" */
  novedad: string;
  fuente: string | null;
  fetchedAt: string;
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
  whatsapp: string[];
  pie: string;
}
