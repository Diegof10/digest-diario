import { hoyArtIso } from "@/lib/habiles";
import type { MercadoRow, MercadoSnapshot } from "@/lib/types";

/**
 * Cinta (ticker) de la propuesta visual. SOLO datos que la página ya tiene.
 * Cada ítem lleva su marca de tiempo honesta:
 *  - "cierre dd/m" sólo si el dato es de una sesión ya terminada (fecha < hoy, con hora real de la fuente)
 *  - si es de hoy y no es cierre: "demorado · hh:mm" con la hora que trae la fuente
 *  - si la fuente sólo trae fecha: "dato dd/m"
 * Nada sugiere precio en vivo.
 */
export interface TickerItem {
  id: string;
  label: string;
  grano?: "soja" | "maiz" | "trigo";
  valor: string;
  unidad: string | null;
  /** decimal; null = sin variación informada (no se muestra flecha) */
  varPct: number | null;
  cuando: string;
}

function dmCorto(dd: string, mm: string): string {
  return `${Number(dd)}/${Number(mm)}`;
}

/** row.hora "25/09, 08:09" (horaArg) → "demorado · 08:09" o "dd/m hh:mm" si no es de hoy */
function cuandoDeHora(hora: string | null | undefined, prefijo: string): string | null {
  const m = hora?.match(/(\d{1,2})\/(\d{1,2}),?\s*(\d{2}:\d{2})/);
  if (!m) return null;
  const [, dd, mm, hhmm] = m;
  const hoy = hoyArtIso();
  const esHoy = hoy.slice(5) === `${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  return esHoy ? `${prefijo} · ${hhmm}` : `${prefijo} · ${dmCorto(dd, mm)} ${hhmm}`;
}

function isoDm(iso: string): string {
  const [, m, d] = iso.split("-");
  return dmCorto(d, m);
}

function grano(r: MercadoRow): TickerItem["grano"] {
  if (/soja/i.test(r.producto)) return "soja";
  if (/ma[ií]z/i.test(r.producto)) return "maiz";
  if (/trigo/i.test(r.producto)) return "trigo";
  return undefined;
}

export function buildTicker(
  mercado: MercadoSnapshot,
  resumen: { fecha: string | null; lineas: string[] } | null,
): TickerItem[] {
  const out: TickerItem[] = [];
  const by = (id: string) => mercado.rows.find((r) => r.id === id);
  const hoy = hoyArtIso();

  // CBOT (Yahoo vía feed): el feed no trae hora de la cotización, sólo la de su lectura
  // → "demorado · hh:mm" (nunca "cierre" porque no se puede saber).
  for (const id of ["chicago-soja", "chicago-maiz", "chicago-trigo"]) {
    const r = by(id);
    if (!r?.valor) continue;
    const cuando = cuandoDeHora(r.hora, "demorado");
    if (!cuando) continue;
    out.push({ id, label: `${r.producto} CBOT`, grano: grano(r), valor: r.valor, unidad: r.unidad, varPct: r.varPct ?? null, cuando });
  }

  // Matba (A3): la fuente sólo informa fecha del dato, sin hora.
  const GL = { soja: "Soja", maiz: "Maíz", trigo: "Trigo" } as const;
  for (const id of ["matba-soja-nov", "matba-soja-may", "matba-maiz", "matba-trigo"]) {
    const r = by(id);
    if (!r?.valor || !r.fecha || r.frescura === "vencido") continue;
    out.push({
      id,
      label: `${grano(r) ? GL[grano(r)!] : r.producto} Matba${r.contrato ? ` ${r.contrato}` : ""}`,
      grano: grano(r),
      valor: r.valor,
      unidad: r.unidad,
      varPct: r.varPct ?? null,
      cuando: `dato ${isoDm(r.fecha)}`,
    });
  }

  // Dólar BNA (feed, sin variación informada)
  const bna = by("fx-bna");
  if (bna?.valor) {
    const cuando = cuandoDeHora(bna.hora, "leído");
    if (cuando) out.push({ id: "fx-bna", label: "Dólar BNA", valor: bna.valor, unidad: null, varPct: null, cuando });
  }

  // Otros dólares: sólo si ya están en la línea FX del Resumen matutino (con su fecha).
  const fx = resumen?.lineas.find((l) => /^\s*FX\s*:/i.test(l));
  if (fx && resumen?.fecha) {
    for (const [re, label] of [
      [/\bblue\s+([0-9][0-9.,]*)/i, "Dólar blue"],
      [/\bMEP\s+([0-9][0-9.,]*)/i, "Dólar MEP"],
      [/\bCCL\s+([0-9][0-9.,]*)/i, "Dólar CCL"],
    ] as const) {
      const m = fx.match(re);
      if (m) out.push({ id: label, label, valor: m[1], unidad: null, varPct: null, cuando: `resumen ${isoDm(resumen.fecha)}` });
    }
  }

  // WTI (Yahoo): trae hora real de la cotización.
  const wti = by("wti");
  if (wti?.valor && wti.frescura !== "vencido") {
    const cuando =
      wti.fecha && wti.fecha < hoy ? `cierre ${isoDm(wti.fecha)}` : cuandoDeHora(wti.hora, "demorado");
    if (cuando) out.push({ id: "wti", label: "WTI", valor: wti.valor, unidad: wti.unidad, varPct: wti.varPct ?? null, cuando });
  }
  return out;
}
