/**
 * Tema visual. Diego eligió A (25/9): toda la página oscura, tipo terminal, por defecto.
 *  - sin ?tema (o cualquier otro valor) → "a"
 *  - ?tema=b → página clara; tablero, cinta y noticias en oscuro (opción para pleno sol)
 * "base" (diseño anterior) queda en el código pero ya no se sirve.
 */
export type Tema = "base" | "a" | "b";

export function parseTema(raw: string | string[] | undefined): Tema {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "b" ? "b" : "a";
}
