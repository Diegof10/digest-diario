import { getCatac } from "@/lib/catac";
import { getFiscal } from "@/lib/fiscal";
import { getMercado } from "@/lib/mercado";
import type { CostoInsumoSlot, DigestSnapshot } from "@/lib/types";

export const PIE_DHF =
  "Elaborado por DHF Advisory. Análisis de gestión. No es orden de venta ni dictamen impositivo.";

const INSUMO_SLOTS: CostoInsumoSlot[] = [
  {
    id: "urea",
    label: "Urea",
    valor: null,
    unidad: "USD/t",
    fecha: null,
    fuente: null,
    etiqueta: "VACÍO",
  },
  {
    id: "fosfato",
    label: "Fosfato (MAP/DAP)",
    valor: null,
    unidad: "USD/t",
    fecha: null,
    fuente: null,
    etiqueta: "VACÍO",
  },
  {
    id: "gasoil",
    label: "Gasoil",
    valor: null,
    unidad: "ARS/l",
    fecha: null,
    fuente: null,
    etiqueta: "VACÍO",
  },
];

function cordobaParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fecha = fmt.format(d); // YYYY-MM-DD
  const label = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
  return { fecha, label };
}

function buildWhatsApp(parts: {
  fechaLabel: string;
  catacLine: string;
  fiscal: string;
  mercadoResumen: string;
}): string[] {
  return [
    `Digest diario · ${parts.fechaLabel}`,
    `Mercado: ${parts.mercadoResumen}`,
    `Flete CATAC: ${parts.catacLine}`,
    "Fert / gasoil: sin dato fechado",
    `Fiscal: ${parts.fiscal}`,
    "Lectura: (slot Informe — 5–6 líneas)",
    "Dato que falta: precios Mercado + fert/gasoil fechados",
    PIE_DHF,
  ];
}

export async function assembleDigest(opts?: {
  km?: number | null;
}): Promise<DigestSnapshot> {
  const km = opts?.km ?? null;
  const { fecha, label } = cordobaParts();
  const [mercado, catac, fiscal] = await Promise.all([
    getMercado(),
    getCatac(km),
    getFiscal(),
  ]);

  let catacLine = "sin dato";
  if (km != null && catac.arsPerTon != null) {
    catacLine = `${km} km → ${catac.arsPerTon.toLocaleString("es-AR")} ARS/t · ${catac.statusLabel}`;
  } else if (catac.ok) {
    catacLine = `tabla ${catac.mesShort ?? "?"} disponible · ${catac.statusLabel} (pasar ?km=)`;
  } else {
    catacLine = catac.statusLabel;
  }

  const mercadoConDato = mercado.rows.filter((r) => r.valor != null).length;
  const mercadoResumen =
    mercadoConDato === 0
      ? "sin dato (stubs Chicago/Matba/CAC/USDA/clima/WTI)"
      : `${mercadoConDato} filas con valor`;

  const lectura: string[] = [
    "(slot 1 — Informe)",
    "(slot 2 — Informe)",
    "(slot 3 — Informe)",
    "(slot 4 — Informe)",
    "(slot 5 — Informe)",
  ];

  const whatsapp = buildWhatsApp({
    fechaLabel: label,
    catacLine,
    fiscal: fiscal.novedad,
    mercadoResumen,
  });

  return {
    ok: true,
    producto: "digest-diario",
    fecha,
    fechaLabel: label,
    generadoAt: new Date().toISOString(),
    mercado,
    catac,
    insumos: INSUMO_SLOTS,
    fiscal,
    lectura,
    whatsapp,
    pie: PIE_DHF,
  };
}
