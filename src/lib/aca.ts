import { dmyToIso } from "@/lib/habiles";

/**
 * ACA (Asociación de Cooperativas Argentinas) · físico de granos, SOLO Timbúes.
 *
 * Fuente: tabla "FÍSICO DE GRANO" de la home de ACA Base (https://www.acabase.com.ar/),
 * que se llena desde js/tablaFisicoDeGranos.js con este JSON público (sin login):
 *   https://s1.dekagb.com/dkmserver.services/html/acabaseservice.aspx?mt=GetMercados&appname=acabase
 * Ítems: nombre (grano), destino (puerto), importe, moneda ("AR$" | "U$S"),
 * mes (posición: "DISPONIBLE", "NOVIEMBRE", …), fecha (dd/mm/aaaa), hora (hh:mm), condiciones.
 *
 * Regla (Diego): sólo posición "disponible" en pesos ($/t). Sin disponible en $ →
 * "sin referencia"; NUNCA otra posición ni otra moneda. Nunca 0, nunca se inventa.
 */

export const ACA_URL = "https://www.acabase.com.ar/";
export const ACA_JSON_URL =
  "https://s1.dekagb.com/dkmserver.services/html/acabaseservice.aspx?mt=GetMercados&appname=acabase";

export interface AcaItem {
  producto?: string;
  nombre?: string;
  puerto?: string;
  destino?: string;
  importe?: number;
  moneda?: string;
  mes?: string;
  fecha?: string;
  hora?: string;
  condiciones?: string;
}

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Lee el JSON de físico de ACA. Cache 10 min (o sin cache en crons). Lanza si falla. */
export async function fetchAcaItems(o: { fresh?: boolean } = {}): Promise<AcaItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(ACA_JSON_URL, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: ACA_URL },
      signal: ctrl.signal,
      ...(o.fresh ? { cache: "no-store" as const } : { next: { revalidate: 600 } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: { value?: AcaItem[] } };
    const v = json?.result?.value;
    if (!Array.isArray(v)) throw new Error("respuesta sin result.value");
    return v;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Disponible en pesos para un destino y grano ("TIMBUES", "SOJA"). El más reciente
 * (fecha + hora de publicación de ACA). null si no hay disponible en $.
 */
export function disponiblePesos(
  items: AcaItem[],
  destino: string,
  grano: string,
): { valor: number; fecha: string; hora: string | null } | null {
  const d = norm(destino);
  const g = norm(grano);
  const cands = items
    .filter(
      (it) =>
        norm(it.destino ?? "") === d &&
        norm(it.nombre ?? "").startsWith(g) &&
        /^\s*DISPONIBLE\s*$/i.test(it.mes ?? "") &&
        /^\s*(AR\$|\$|ARS)\s*$/i.test(it.moneda ?? "") &&
        typeof it.importe === "number" &&
        Number.isFinite(it.importe) &&
        it.importe > 0,
    )
    .map((it) => ({ valor: it.importe as number, fecha: dmyToIso(it.fecha), hora: it.hora?.trim() || null }))
    .filter((x): x is { valor: number; fecha: string; hora: string | null } => Boolean(x.fecha))
    .sort((a, b) => `${b.fecha} ${b.hora ?? ""}`.localeCompare(`${a.fecha} ${a.hora ?? ""}`));
  return cands[0] ?? null;
}
