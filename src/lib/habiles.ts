/**
 * Días hábiles (lun–vie, ART). No contempla feriados nacionales.
 *
 * Regla de frescura de precios (Diego): atraso contra la última publicación ESPERADA
 * de cada fuente (ver REGLAS), no contra hoy.
 *  - dato == esperado (o más nuevo) → "fresco"
 *  - 1 a 3 hábiles detrás de lo esperado → "viejo" (se muestra marcado)
 *  - más de 3 hábiles → "vencido" (NO se muestra el precio)
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

/**
 * Regla de publicación por fuente: el dato del hábil D se publica el hábil
 * D+offsetHabiles a partir de la hora `hora` (ART).
 *  - CAC pizarra: D se publica D+1 ~10:15 → { offsetHabiles: 1, hora: "10:30" }
 *  - Sin horario conocido: esperado = hábil anterior (a hoy) → { offsetHabiles: 0, hora: "23:59" }
 */
export interface ReglaPublicacion {
  offsetHabiles: number;
  hora: string; // "HH:MM" ART
}

export const REGLA_DEFAULT: ReglaPublicacion = { offsetHabiles: 0, hora: "23:59" };

export const REGLAS: Record<string, ReglaPublicacion> = {
  // Cámara Arbitral de Cereales (BCR): pizarra de D publicada el hábil siguiente ~10:15.
  cac: { offsetHabiles: 1, hora: "10:30" },
  // AFA San Martín y ACA: horario de publicación no documentado → hábil anterior.
  afa: REGLA_DEFAULT,
  aca: REGLA_DEFAULT,
};

function ahoraArt(now = new Date()): { fecha: string; hhmm: string } {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return { fecha: hoyArtIso(now), hhmm: hhmm.replace(/^24/, "00") };
}

function sumarHabiles(iso: string, n: number): string {
  const d = toUtcDate(iso);
  let k = 0;
  while (k < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isHabil(d)) k++;
  }
  return fromUtcDate(d);
}

/** Fecha de dato más reciente que la fuente ya debería haber publicado. */
export function fechaEsperada(regla: ReglaPublicacion = REGLA_DEFAULT, now = new Date()): string {
  const { fecha, hhmm } = ahoraArt(now);
  let d = isHabil(toUtcDate(fecha)) ? fecha : habilAnterior(fecha);
  for (let i = 0; i < 30; i++) {
    const pub = sumarHabiles(d, regla.offsetHabiles);
    if (pub < fecha || (pub === fecha && hhmm >= regla.hora)) return d;
    d = habilAnterior(d);
  }
  return d;
}

/** Hábiles de atraso del dato vs la fecha esperada (0 si igual o más nuevo). */
export function atrasoVsEsperado(fechaDatoIso: string, esperada: string): number {
  if (fechaDatoIso >= esperada) return 0;
  let n = 0;
  const d = toUtcDate(fechaDatoIso);
  const end = toUtcDate(esperada);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isHabil(d)) n++;
  }
  return n;
}

export function frescura(
  fechaDatoIso: string | null | undefined,
  regla: ReglaPublicacion = REGLA_DEFAULT,
  now = new Date(),
): Frescura {
  if (!fechaDatoIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDatoIso)) return "vencido";
  const n = atrasoVsEsperado(fechaDatoIso, fechaEsperada(regla, now));
  if (n === 0) return "fresco";
  if (n <= 3) return "viejo";
  return "vencido";
}

/**
 * Insumos por ciclo de publicación (días corridos): gasoil/glifosato 7, fertilizantes 31.
 * ≤1 ciclo: fresco · >1 ciclo: viejo · >2 ciclos: vencido ("sin dato fresco").
 */
export function frescuraCiclo(
  fechaDatoIso: string | null | undefined,
  cicloDias: number,
  hoyIso = hoyArtIso(),
): Frescura {
  if (!fechaDatoIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDatoIso)) return "vencido";
  const dias = Math.round((toUtcDate(hoyIso).getTime() - toUtcDate(fechaDatoIso).getTime()) / 86_400_000);
  if (dias > 2 * cicloDias) return "vencido";
  if (dias > cicloDias) return "viejo";
  return "fresco";
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
