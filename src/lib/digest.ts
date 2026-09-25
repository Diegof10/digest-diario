import { getCatac } from "@/lib/catac";
import { getFiscal } from "@/lib/fiscal";
import { getInsumos } from "@/lib/insumos";
import { getMercado, rowById } from "@/lib/mercado";
import { frescura, isoToDm } from "@/lib/habiles";
import { lineaResumen } from "@/lib/plazas";
import { loadResumenMatutino, mergeResumenConPlazas } from "@/lib/resumen-matutino";
import type { CostoInsumoSlot, DigestSnapshot, MercadoRow } from "@/lib/types";

export const PIE_DHF =
  "Análisis de gestión. No es orden de venta ni dictamen impositivo.";
export const X_PROFILE_URL = "https://x.com/dhferrari";
export const X_HANDLE = "@dhferrari";

export const DEFAULT_KM = 180;

const EMPTY_INSUMO_SLOTS: CostoInsumoSlot[] = [];

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
  const [y, m, day] = fecha.split("-");
  const fechaCorta = `${day}/${m}/${y}`;
  return { fecha, label, fechaCorta };
}

function cell(r: MercadoRow | undefined): string {
  if (!r?.valor) return "—";
  const senal = r.senal ? ` ${r.senal}` : "";
  const extra = r.extra ? ` (${r.extra})` : "";
  const unidad = r.unidad ? ` ${r.unidad}` : "";
  return `${r.valor}${unidad}${senal}${extra}`;
}

function buildLectura(mercadoNote: string, wasde: string | null | undefined): string[] {
  const slots: string[] = [];
  if (wasde) {
    // Split long WASDE into ~lines
    const parts = wasde.split(/(?<=\.)\s+/).filter(Boolean);
    for (const p of parts.slice(0, 4)) slots.push(p);
  }
  if (mercadoNote && mercadoNote !== wasde) {
    const extra = mercadoNote
      .replace(wasde ?? "", "")
      .trim()
      .split(/(?<=\.)\s+/)
      .filter(Boolean);
    for (const e of extra) {
      if (slots.length >= 6) break;
      if (!slots.includes(e)) slots.push(e);
    }
  }
  while (slots.length < 5) slots.push("—");
  return slots.slice(0, 6);
}

function buildResumenFallback(parts: {
  fechaCorta: string;
  chicago: string;
  cac: string;
  matba: string;
  bna: string;
  catacLine: string;
  fiscal: string;
  wasdeBrief: string;
}): string[] {
  return [
    `Resumen agrario · ${parts.fechaCorta}`,
    `Chicago: ${parts.chicago}`,
    `CAC Rosario: ${parts.cac}`,
    `Matba: ${parts.matba}`,
    `BNA: ${parts.bna}`,
    `Flete CATAC: ${parts.catacLine}`,
    parts.wasdeBrief
      ? `USDA: ${parts.wasdeBrief}`
      : `Fiscal: ${parts.fiscal}`,
    PIE_DHF,
  ];
}

export async function assembleDigest(opts?: {
  km?: number | null;
  fresh?: boolean;
}): Promise<DigestSnapshot> {
  const km =
    opts?.km != null && Number.isFinite(opts.km) ? opts.km : DEFAULT_KM;
  const { fecha, label, fechaCorta } = cordobaParts();
  const [mercado, catac, fiscal, insumosSnap] = await Promise.all([
    getMercado({ fresh: opts?.fresh }),
    getCatac(km),
    getFiscal(),
    getInsumos().catch(() => null),
  ]);

  let catacLine = "sin dato";
  if (catac.arsPerTon != null) {
    catacLine = `${km} km → ${catac.arsPerTon.toLocaleString("es-AR")} ARS/t · ${catac.statusLabel}`;
  } else if (catac.ok) {
    catacLine = `tabla ${catac.mesShort ?? "?"} · ${catac.statusLabel}`;
  } else {
    catacLine = catac.statusLabel;
  }

  const sojaChi = rowById(mercado.rows, "chicago-soja");
  const maizChi = rowById(mercado.rows, "chicago-maiz");
  const trigoChi = rowById(mercado.rows, "chicago-trigo");
  const sojaCac = rowById(mercado.rows, "cac-soja");
  const maizCac = rowById(mercado.rows, "cac-maiz");
  const trigoCac = rowById(mercado.rows, "cac-trigo");
  const sojaMay = rowById(mercado.rows, "matba-soja-may");
  const sojaNov = rowById(mercado.rows, "matba-soja-nov");
  const maizMat = rowById(mercado.rows, "matba-maiz");
  const trigoMat = rowById(mercado.rows, "matba-trigo");
  const bna = rowById(mercado.rows, "fx-bna");

  const chicago = [
    sojaChi?.valor ? `Soja ${sojaChi.valor}${sojaChi.senal ?? ""}` : null,
    maizChi?.valor ? `Maíz ${maizChi.valor}${maizChi.senal ?? ""}` : null,
    trigoChi?.valor ? `Trigo ${trigoChi.valor}${trigoChi.senal ?? ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  const cac = [
    sojaCac?.valor ? `Soja ${sojaCac.valor}` : null,
    maizCac?.valor ? `Maíz ${maizCac.valor}` : null,
    trigoCac?.valor ? `Trigo ${trigoCac.valor}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  const matba = [
    sojaMay?.valor
      ? `Soja May ${sojaMay.valor}`
      : sojaNov?.valor
        ? `Soja Nov ${sojaNov.valor}`
        : null,
    maizMat?.valor ? `Maíz ${maizMat.valor}` : null,
    trigoMat?.valor ? `Trigo ${trigoMat.valor}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  const lectura = buildLectura(mercado.note, mercado.wasdeHeadline);

  const wasdeBrief = mercado.wasdeHeadline
    ? mercado.wasdeHeadline.slice(0, 100) +
      (mercado.wasdeHeadline.length > 100 ? "…" : "")
    : "";

  const fallback = buildResumenFallback({
    fechaCorta,
    chicago,
    cac,
    matba,
    bna: cell(bna),
    catacLine,
    fiscal: fiscal.novedad,
    wasdeBrief,
  });

  // CoS bundled txt (src/data/resumen-matutino.txt) wins when body lines exist.
  // Never invent news: missing/empty → auto-built fallback only.
  // Líneas AFA / CAC / FOB: generadas del feed vivo (src/lib/plazas.ts).
  const cos = await loadResumenMatutino();
  const plazaLines = mercado.plazas
    ? [mercado.plazas.afa, mercado.plazas.cac, mercado.plazas.fob]
        .map(lineaResumen)
        .filter((l): l is string => Boolean(l))
    : [];
  const merged = mergeResumenConPlazas(
    cos ? { fecha: cos.fecha, lineas: cos.lineas } : null,
    plazaLines,
    { frescuraDe: (f) => frescura(f), fechaDm: (f) => isoToDm(f) },
  );
  const resumenMatutino = cos && cos.lineas.length > 0 ? (merged ?? fallback) : fallback;

  return {
    ok: true,
    producto: "resumen-agrario",
    fecha,
    fechaLabel: label,
    fechaCorta,
    generadoAt: new Date().toISOString(),
    mercado,
    catac,
    insumos: (insumosSnap?.slots ?? EMPTY_INSUMO_SLOTS).filter(
      (s) => Boolean(s.valor && s.fuente && s.fecha),
    ),
    fiscal,
    lectura,
    resumenMatutino,
    pie: PIE_DHF,
  };
}
