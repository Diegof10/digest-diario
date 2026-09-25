import { dmyToIso, frescura, REGLA_DEFAULT, type Frescura } from "@/lib/habiles";

/**
 * ACA (Asociación de Cooperativas Argentinas) · físico de granos por puerto.
 *
 * Fuente: tabla "FÍSICO DE GRANO" de la home de ACA Base (https://www.acabase.com.ar/).
 * La tabla se llena en el navegador desde js/tablaFisicoDeGranos.js con este JSON público
 * (sin login, se lee server-side):
 *   https://s1.dekagb.com/dkmserver.services/html/acabaseservice.aspx?mt=GetMercados&appname=acabase
 * Cada ítem trae: nombre (grano), puerto (zona, p.ej. "RS"), destino (puerto/terminal),
 * importe, moneda ("AR$" | "U$S"), mes (posición: "DISPONIBLE", "NOVIEMBRE", …),
 * fecha (dd/mm/aaaa), hora (hh:mm) y condiciones.
 * (mercadosonline.asp sólo embebe un iframe de CMA con CBOT/Matba/Rofex: no tiene físico.)
 *
 * Regla (Diego): SOLO posición "disponible" en pesos ($/t). Si un puerto/cultivo no tiene
 * disponible en $, la fila dice "sin referencia" y NUNCA toma otra posición ni otra moneda.
 * Nunca 0, nunca se inventa. Fecha/hora = las que publica ACA en cada ítem.
 */

export const ACA_URL = "https://www.acabase.com.ar/";
export const ACA_JSON_URL =
  "https://s1.dekagb.com/dkmserver.services/html/acabaseservice.aspx?mt=GetMercados&appname=acabase";

export type AcaCultivo = "soja" | "maiz" | "trigo" | "girasol" | "sorgo";
export const ACA_CULTIVOS: AcaCultivo[] = ["soja", "maiz", "trigo", "girasol", "sorgo"];
export const ACA_CULTIVO_LABEL: Record<AcaCultivo, string> = {
  soja: "Soja",
  maiz: "Maíz",
  trigo: "Trigo",
  girasol: "Girasol",
  sorgo: "Sorgo",
};
/** Puertos pedidos explícitamente: si ACA no publica nada ahí, se aclara en la nota. */
export const ACA_PUERTOS_PEDIDOS = ["Timbúes", "Rosario", "San Lorenzo", "Quequén", "Bahía Blanca"];

export interface AcaFila {
  /** "soja-timbues" (clave para la serie en Blob) */
  key: string;
  cultivo: AcaCultivo;
  puerto: string;
  /** $/t disponible; null = sin referencia */
  valor: number | null;
  /** Fecha/hora de publicación que muestra ACA (yyyy-mm-dd / hh:mm) */
  fechaPub: string | null;
  horaPub: string | null;
  condiciones: string | null;
  frescura: Frescura | null;
  /** Por qué no hay precio (sin referencia) */
  motivo: string | null;
}

export interface AcaSnapshot {
  ok: boolean;
  fuente: string;
  url: string;
  filas: AcaFila[];
  /** Cultivos que ACA no publica en ningún puerto */
  cultivosSinPublicar: AcaCultivo[];
  /** Puertos pedidos sin ninguna publicación de ACA */
  puertosSinPublicar: string[];
  leidoAt: string;
  error: string | null;
}

interface AcaItem {
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

const PUERTO_NOMBRE: Record<string, string> = {
  TIMBUES: "Timbúes",
  ROSARIO: "Rosario",
  "SAN LORENZO": "San Lorenzo",
  "SAN MARTIN": "San Martín",
  "PUERTO SAN MARTIN": "Puerto San Martín",
  "GENERAL LAGOS": "General Lagos",
  "DEL GUAZU": "Del Guazú",
  RAMALLO: "Ramallo",
  QUEQUEN: "Quequén",
  NECOCHEA: "Necochea",
  "BAHIA BLANCA": "Bahía Blanca",
  "SAN NICOLAS": "San Nicolás",
  "VILLA CONSTITUCION": "Villa Constitución",
  "ARROYO SECO": "Arroyo Seco",
  ZARATE: "Zárate",
  LIMA: "Lima",
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}

function puertoNombre(raw: string): string {
  const n = norm(raw);
  if (PUERTO_NOMBRE[n]) return PUERTO_NOMBRE[n];
  return n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function slug(s: string): string {
  return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function cultivoDe(nombre: string): AcaCultivo | null {
  const n = norm(nombre);
  if (/^SOJA/.test(n)) return "soja";
  if (/^MAIZ/.test(n)) return "maiz";
  if (/^TRIGO/.test(n)) return "trigo";
  if (/^GIRASOL/.test(n)) return "girasol";
  if (/^SORGO/.test(n)) return "sorgo";
  return null;
}

const esPesos = (m: string | undefined) => /^\s*(AR\$|\$|ARS)\s*$/i.test(m ?? "");
const esDisponible = (m: string | undefined) => /^\s*DISPONIBLE\s*$/i.test(m ?? "");

export async function getAca(o: { fresh?: boolean } = {}): Promise<AcaSnapshot> {
  const leidoAt = new Date().toISOString();
  const base = { fuente: "ACA · Asociación de Cooperativas Argentinas", url: ACA_URL, leidoAt };
  let items: AcaItem[];
  try {
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
      items = v;
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    return {
      ...base,
      ok: false,
      filas: [],
      cultivosSinPublicar: [],
      puertosSinPublicar: [],
      error: `ACA no disponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Agrupa por cultivo + puerto (destino) todo lo que ACA publica, en cualquier posición.
  type Grupo = { cultivo: AcaCultivo; puerto: string; items: AcaItem[] };
  const grupos = new Map<string, Grupo>();
  for (const it of items) {
    const cultivo = cultivoDe(it.nombre ?? it.producto ?? "");
    const destino = (it.destino ?? "").trim();
    if (!cultivo || !destino) continue;
    const puerto = puertoNombre(destino);
    const key = `${cultivo}-${slug(puerto)}`;
    const g = grupos.get(key) ?? { cultivo, puerto, items: [] };
    g.items.push(it);
    grupos.set(key, g);
  }

  const filas: AcaFila[] = [];
  for (const [key, g] of grupos) {
    const disp = g.items.filter((it) => esDisponible(it.mes));
    const dispPesos = disp
      .filter((it) => esPesos(it.moneda) && typeof it.importe === "number" && Number.isFinite(it.importe) && it.importe > 0)
      .map((it) => ({ it, fecha: dmyToIso(it.fecha) }))
      .filter((x) => x.fecha)
      .sort((a, b) => `${b.fecha} ${b.it.hora ?? ""}`.localeCompare(`${a.fecha} ${a.it.hora ?? ""}`));
    const best = dispPesos[0];
    if (best) {
      filas.push({
        key,
        cultivo: g.cultivo,
        puerto: g.puerto,
        valor: best.it.importe!,
        fechaPub: best.fecha,
        horaPub: best.it.hora?.trim() || null,
        condiciones: best.it.condiciones?.trim() || null,
        frescura: frescura(best.fecha, REGLA_DEFAULT),
        motivo: null,
      });
    } else {
      const fechas = g.items.map((it) => dmyToIso(it.fecha)).filter((f): f is string => Boolean(f)).sort();
      filas.push({
        key,
        cultivo: g.cultivo,
        puerto: g.puerto,
        valor: null,
        fechaPub: fechas[fechas.length - 1] ?? null,
        horaPub: null,
        condiciones: null,
        frescura: null,
        motivo:
          disp.length > 0
            ? `disponible publicado sólo en ${Array.from(new Set(disp.map((d) => (d.moneda ?? "").trim()))).join("/")}`
            : "sin posición disponible",
      });
    }
  }
  filas.sort(
    (a, b) =>
      ACA_CULTIVOS.indexOf(a.cultivo) - ACA_CULTIVOS.indexOf(b.cultivo) ||
      Number(b.valor != null) - Number(a.valor != null) ||
      a.puerto.localeCompare(b.puerto, "es"),
  );

  const publicados = new Set(filas.map((f) => f.cultivo));
  const puertosPub = new Set(filas.map((f) => slug(f.puerto)));
  return {
    ...base,
    ok: true,
    filas,
    cultivosSinPublicar: ACA_CULTIVOS.filter((c) => !publicados.has(c)),
    puertosSinPublicar: ACA_PUERTOS_PEDIDOS.filter((p) => !puertosPub.has(slug(p))),
    error: filas.length === 0 ? "ACA no publicó físico de granos" : null,
  };
}
