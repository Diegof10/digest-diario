/**
 * Propuesta visual (rama ui-propuesta, NO producción):
 *  - sin ?tema → diseño actual (para comparar)
 *  - ?tema=a   → toda la página oscura, tipo terminal
 *  - ?tema=b   → página clara; tablero, cinta y noticias en oscuro
 */
export type Tema = "base" | "a" | "b";

export function parseTema(raw: string | string[] | undefined): Tema {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "a" || v === "b" ? v : "base";
}
