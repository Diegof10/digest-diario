/**
 * Mercado ganadero: Mercado Agroganadero S.A. (Cañuelas). Reportes públicos sin login.
 *  - haciinfo000011: totales por día + I.N.M.A.G.
 *  - haciinfo000014: I.G.M.A.G. por día
 *  - haciinfo000002: precios por categoría ($/kg vivo) de un día
 * Sólo se muestran valores publicados por el MAG, con su fecha. Cache 30 min.
 */

export const HACIENDA_FUENTE = "Mercado Agroganadero (Cañuelas)";
export const HACIENDA_URL = "https://www.mercadoagroganadero.com.ar/dll/inicio.dll";
const BASE = "https://www.mercadoagroganadero.com.ar/dll";

export interface HaciendaIndice {
  valor: number;
  fecha: string; // dd/mm/yyyy
  prev: number | null;
  prevFecha: string | null;
  varPct: number | null;
}

export interface HaciendaCategoria {
  categoria: string;
  promedio: number;
  minimo: number | null;
  maximo: number | null;
  cabezas: number;
  kgProm: number | null;
}

export interface HaciendaSnapshot {
  ok: boolean;
  fuente: string;
  url: string;
  inmag: HaciendaIndice | null;
  igmag: HaciendaIndice | null;
  /** último día cerrado (con precios definitivos o provisorios) */
  dia: { fecha: string; cabezas: number; estado: string | null } | null;
  /** ingreso del día en curso, si el MAG lo muestra abierto */
  hoy: { fecha: string; cabezas: number } | null;
  categorias: HaciendaCategoria[];
  leidoAt: string;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clean(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rows(html: string): string[][] {
  const out: string[][] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
    if (cells.length) out.push(cells);
  }
  return out;
}

function ddmmyyyy(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (ResumenAgrario)" },
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`MAG ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("latin1").decode(buf);
}

interface DiaRow {
  fecha: string;
  cabezas: number;
  importe: number | null;
  indice: number | null;
  abierto: boolean;
}

function parseDias(html: string): DiaRow[] {
  return rows(html)
    .filter((c) => /\d{2}\/\d{2}\/\d{4}/.test(c[0] ?? ""))
    .map((c) => ({
      fecha: (c[0].match(/\d{2}\/\d{2}\/\d{4}/) ?? [""])[0],
      cabezas: num(c[1]) ?? 0,
      importe: num(c[2]),
      indice: num(c[3]),
      abierto: /falta cerrar/i.test(c.join(" ")),
    }));
}

function indiceDe(dias: DiaRow[]): HaciendaIndice | null {
  const conValor = dias.filter((d) => !d.abierto && d.indice != null && d.indice > 0);
  const last = conValor.at(-1);
  if (!last) return null;
  const prev = conValor.at(-2) ?? null;
  return {
    valor: last.indice!,
    fecha: last.fecha,
    prev: prev?.indice ?? null,
    prevFecha: prev?.fecha ?? null,
    varPct: prev?.indice ? last.indice! / prev.indice - 1 : null,
  };
}

const NOMBRES: Record<string, string> = {
  NOVILLOS: "Novillos",
  NOVILLITOS: "Novillitos",
  VAQUILLONAS: "Vaquillonas",
  VACAS: "Vacas",
  TOROS: "Toros",
  MEJ: "MEJ",
};

function parseCategorias(html: string): HaciendaCategoria[] {
  const out: HaciendaCategoria[] = [];
  let grupo: string | null = null;
  let mins: number[] = [];
  let maxs: number[] = [];
  let sawSep = false;
  for (const c of rows(html)) {
    if (c.length < 9) continue;
    if (c[0]) {
      const g = c[0].split(" ")[0].toUpperCase();
      if (g !== grupo) {
        grupo = g;
        mins = [];
        maxs = [];
      }
      const mi = num(c[1]);
      const ma = num(c[2]);
      if (mi != null) mins.push(mi);
      if (ma != null) maxs.push(ma);
      sawSep = false;
      continue;
    }
    if (/^-+$/.test(c[3])) {
      sawSep = true;
      continue;
    }
    if (sawSep && grupo) {
      const prom = num(c[3]);
      const cab = num(c[5]);
      if (prom != null && cab != null && cab > 0) {
        out.push({
          categoria: NOMBRES[grupo] ?? grupo.charAt(0) + grupo.slice(1).toLowerCase(),
          promedio: prom,
          minimo: mins.length ? Math.min(...mins) : null,
          maximo: maxs.length ? Math.max(...maxs) : null,
          cabezas: cab,
          kgProm: num(c[8]),
        });
      }
      sawSep = false;
    }
  }
  return out;
}

export async function getHacienda(now: Date = new Date()): Promise<HaciendaSnapshot> {
  const leidoAt = now.toISOString();
  const base: HaciendaSnapshot = {
    ok: false,
    fuente: HACIENDA_FUENTE,
    url: HACIENDA_URL,
    inmag: null,
    igmag: null,
    dia: null,
    hoy: null,
    categorias: [],
    leidoAt,
  };
  try {
    const fin = ddmmyyyy(now);
    const ini = ddmmyyyy(new Date(now.getTime() - 21 * 86400000));
    const q = `txtFechaIni=${ini}&txtFechaFin=${fin}`;
    const [tot, gen] = await Promise.all([
      get(`hacienda2.dll/haciinfo000011?${q}`),
      get(`hacienda2.dll/haciinfo000014?${q}`),
    ]);
    const dias = parseDias(tot);
    const diasG = parseDias(gen);
    const cerrados = diasG.filter((d) => !d.abierto && (d.importe ?? 0) > 0);
    const ultimo = cerrados.at(-1) ?? null;
    const abierto = dias.find((d) => d.abierto) ?? null;

    let categorias: HaciendaCategoria[] = [];
    let estado: string | null = null;
    if (ultimo) {
      const html = await get(
        `hacienda1.dll/haciinfo000002?txtFechaIni=${ultimo.fecha}&txtFechaFin=${ultimo.fecha}`,
      );
      categorias = parseCategorias(html);
      estado = /PRECIOS DEFINITIVOS/i.test(html)
        ? "definitivos"
        : /PRECIOS PROVISORIOS/i.test(html)
          ? "provisorios"
          : null;
    }

    return {
      ...base,
      ok: !!ultimo,
      inmag: indiceDe(dias),
      igmag: indiceDe(diasG),
      dia: ultimo ? { fecha: ultimo.fecha, cabezas: ultimo.cabezas, estado } : null,
      hoy: abierto && abierto.cabezas > 0 ? { fecha: abierto.fecha, cabezas: abierto.cabezas } : null,
      categorias,
    };
  } catch {
    return base;
  }
}
