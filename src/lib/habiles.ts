/**
 * Días hábiles (lun–vie, ART). No contempla feriados nacionales.
 *
 * Regla de frescura de precios (Diego):
 *  - dato de hoy o del último día hábil → "fresco"
 *  - 1 a 3 días hábiles de atraso vs el último hábil → "viejo" (se muestra marcado)
 *  - más de 3 días hábiles → "vencido" (NO se muestra el precio)
 */

export type Frescura = "fresco" | "viejo" | "vencido";

const TZ = "America/Argentina/Cordoba";

/** YYYY-MM-DD en ART. */
export function hoyArtIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isHabil(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Último día hábil estrictamente anterior a `iso`. */
export function habilAnterior(iso: string): string {
  const d = toUtcDate(iso);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (!isHabil(d));
  return fromUtcDate(d);
}

/**
 * Días hábiles de atraso: cantidad de hábiles h con fechaDato < h <= ref,
 * donde ref = último hábil anterior a hoy. Dato de hoy o de ref → 0.
 */
export function atrasoHabiles(fechaDatoIso: string, hoyIso = hoyArtIso()): number {
  const ref = habilAnterior(hoyIso);
  if (fechaDatoIso >= ref) return 0;
  let n = 0;
  const d = toUtcDate(fechaDatoIso);
  const end = toUtcDate(ref);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isHabil(d)) n++;
  }
  return n;
}

export function frescura(fechaDatoIso: string | null | undefined, hoyIso = hoyArtIso()): Frescura {
  if (!fechaDatoIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDatoIso)) return "vencido";
  const n = atrasoHabiles(fechaDatoIso, hoyIso);
  if (n === 0) return "fresco";
  if (n <= 3) return "viejo";
  return "vencido";
}

/** "dd/mm/yyyy" → "yyyy-mm-dd" (null si no matchea). */
export function dmyToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** "yyyy-mm-dd" → "dd/mm". */
export function isoToDm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "yyyy-mm-dd" → "dd/mm/yyyy". */
export function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
