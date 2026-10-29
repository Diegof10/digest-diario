/**
 * Tipo de cambio de referencia del BCRA (Comunicación A 3500),
 * API de Estadísticas Cambiarias (sin clave):
 *   GET https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD
 * `tipoCotizacion` es el tipo de cambio de referencia en $/USD de esa fecha.
 * No es el billete minorista del BNA ni la divisa comprador.
 */

export const A3500_URL =
  "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD";
export const FUENTE_A3500 = "BCRA A3500 · tipo de cambio de referencia";

export interface CotizacionFx {
  valor: number;
  /** yyyy-mm-dd de la cotización publicada */
  fecha: string;
  fuente: string;
}

type FetchImpl = typeof fetch;

interface A3500Payload {
  results?: Array<{
    fecha?: string;
    detalle?: Array<{ codigoMoneda?: string; tipoCotizacion?: number }>;
  }>;
}

export function parseA3500(payload: A3500Payload | null | undefined): CotizacionFx[] {
  const out: CotizacionFx[] = [];
  for (const row of payload?.results ?? []) {
    const fecha = row.fecha ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const usd = row.detalle?.find((d) => d.codigoMoneda === "USD") ?? row.detalle?.[0];
    const valor = usd?.tipoCotizacion;
    if (valor == null || !Number.isFinite(valor) || valor <= 0) continue;
    out.push({ valor, fecha, fuente: FUENTE_A3500 });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Última cotización con fecha <= `fecha` (el A3500 de un día se publica con esa fecha). */
export function a3500Vigente(serie: CotizacionFx[], fecha: string): CotizacionFx | null {
  let hit: CotizacionFx | null = null;
  for (const c of serie) {
    if (c.fecha <= fecha) hit = c;
  }
  return hit;
}

export async function fetchA3500(
  opts: { desde: string; hasta: string; fetchImpl?: FetchImpl; timeoutMs?: number } = {
    desde: "",
    hasta: "",
  },
): Promise<CotizacionFx[]> {
  const f = opts.fetchImpl ?? fetch;
  const qs = new URLSearchParams();
  if (opts.desde) qs.set("fechaDesde", opts.desde);
  if (opts.hasta) qs.set("fechaHasta", opts.hasta);
  const url = qs.size ? `${A3500_URL}?${qs}` : A3500_URL;
  const res = await f(url, {
    headers: { Accept: "application/json", "User-Agent": "resumen-agrario/bcra" },
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
  });
  if (!res.ok) throw new Error(`BCRA A3500 HTTP ${res.status}`);
  return parseA3500((await res.json()) as A3500Payload);
}
