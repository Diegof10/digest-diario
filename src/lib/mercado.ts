import type { MercadoSnapshot, MercadoRow } from "@/lib/types";

/** Slots que Mercado plugueará: Chicago / Matba / CAC / USDA / clima / WTI */
const SLOTS: Omit<MercadoRow, "valor" | "unidad" | "fuente" | "hora" | "etiqueta">[] = [
  { id: "chicago-soja", mercado: "Chicago", producto: "Soja" },
  { id: "chicago-maiz", mercado: "Chicago", producto: "Maíz" },
  { id: "chicago-trigo", mercado: "Chicago", producto: "Trigo" },
  { id: "matba-soja", mercado: "Matba Rofex", producto: "Soja" },
  { id: "matba-maiz", mercado: "Matba Rofex", producto: "Maíz" },
  { id: "matba-trigo", mercado: "Matba Rofex", producto: "Trigo" },
  { id: "cac-soja", mercado: "CAC Rosario", producto: "Soja" },
  { id: "cac-maiz", mercado: "CAC Rosario", producto: "Maíz" },
  { id: "cac-trigo", mercado: "CAC Rosario", producto: "Trigo" },
  { id: "usda", mercado: "USDA", producto: "Reporte" },
  { id: "clima", mercado: "Clima", producto: "Zona núcleo" },
  { id: "wti", mercado: "Energía", producto: "WTI" },
];

export async function getMercado(): Promise<MercadoSnapshot> {
  return {
    ok: false,
    rows: SLOTS.map((s) => ({
      ...s,
      valor: null,
      unidad: null,
      fuente: null,
      hora: null,
      etiqueta: "VACÍO" as const,
    })),
    note: "Stub Mercado: Chicago/Matba/CAC/USDA/clima/WTI pendientes de plug-in. Sin inventar precios.",
    fetchedAt: new Date().toISOString(),
  };
}
