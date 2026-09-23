/** Tipos del digest diario. Mercado/Fiscal son stubs para plug-in posterior. */

export type EtiquetaDato = "HECHO" | "ÚLTIMO_GUARDADO" | "VACÍO" | "SUPUESTO";

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
}

export interface MercadoSnapshot {
  ok: boolean;
  rows: MercadoRow[];
  note: string;
  fetchedAt: string;
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
