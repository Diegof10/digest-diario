import { hoyArtIso, isoToDmy } from "@/lib/habiles";
import type { CotizacionGrano, PlazaSnapshot } from "@/lib/plazas";
import type { ClimaVivoSnapshot } from "@/lib/clima-vivo";
import type { FiscalSnapshot, MercadoSnapshot } from "@/lib/types";

/**
 * Tarjetas de lectura (reemplazan el bloque de texto "Lectura").
 * Título y resumen se arman solos en cada render (reglas de Mercado Granos, 25/9) con el
 * mismo feed de la página; no hay textos cargados a mano ni datos nuevos.
 *  - Granos: flecha = variación CBOT de la cinta (● si |var| < 0,3% o sin dato);
 *    local = variación de la última pizarra CAC; resumen con CBOT, AFA y CAC.
 *  - Clima: ● siempre. Condición mayoritaria de BA/SF/Córdoba (Open-Meteo).
 *  - Dólar: variación BNA divisa comprador (● si |var| < 0,3%).
 *  - Fiscal: ● siempre; texto de Fiscal mientras haya novedad (7 días), si no próximo vencimiento.
 */

export type Flecha = "up" | "down" | "flat";

export interface CardSection {
  flecha: Flecha;
  /** texto accesible de la flecha, p.ej. "baja 0,9%" */
  flechaLabel: string;
  titulo: string;
  resumen: string;
  fuente: string | null;
  hora: string | null;
}

export interface LecturaCard {
  id: "soja" | "maiz" | "trigo" | "clima" | "dolar-fiscal";
  icon: { kind: "grano"; grano: "soja" | "maiz" | "trigo" } | { kind: "clima"; code: number | null } | { kind: "dolar" };
  sections: CardSection[];
}

const LABEL = { soja: "Soja", maiz: "Maíz", trigo: "Trigo" } as const;

/** Texto fijo de Fiscal mientras haya una norma en "novedad" (regla 7 días del panel). */
const FISCAL_NOVEDAD = {
  titulo: "Fiscal · DJ Ganancias al 13/10",
  resumen:
    "La RG 5898 (Boletín Oficial del 21/09) extiende hasta el 13/10 la DJ de Ganancias 2025 de personas humanas. El 2° anticipo de Ganancias y Bienes Personales vence entre el 13 y el 15/10, según la terminación del CUIT. Fuente: Boletín Oficial y ARCA.",
  fuente: "Boletín Oficial · ARCA",
  hora: "BO 21/09",
};

function isoMasDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function seccionFiscal(fiscal: FiscalSnapshot, hoy: string): CardSection {
  const base = { flecha: "flat" as const, flechaLabel: "sin flecha (fiscal)" };
  if (fiscal.ok && fiscal.novedades.length > 0) return { ...base, ...FISCAL_NOVEDAD };
  const hasta = isoMasDias(hoy, 7);
  const prox = fiscal.vencimientos
    .filter((v) => v.vence && v.vence >= hoy && v.vence <= hasta)
    .sort((a, b) => (a.vence ?? "").localeCompare(b.vence ?? ""))[0];
  if (prox?.vence) {
    return {
      ...base,
      titulo: `Fiscal · vence ${isoToDmy(prox.vence).slice(0, 5)}`,
      resumen: `${prox.concepto}: ${prox.ventana}.`,
      fuente: prox.fuente ?? fiscal.fuente,
      hora: null,
    };
  }
  return { ...base, titulo: "Sin novedad fiscal", resumen: "Sin novedad fiscal ni vencimientos en los próximos 7 días.", fuente: fiscal.fuente, hora: null };
}

const UMBRAL = 0.003; // 0,3%

function pct1(v: number): string {
  return Math.abs(v * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function n0(v: number): string {
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function n1(v: number): string {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function dm(iso: string): string {
  return isoToDmy(iso).slice(0, 5);
}
function flechaUmbral(v: number | null | undefined): { flecha: Flecha; label: string } {
  if (v == null || !Number.isFinite(v)) return { flecha: "flat", label: "sin dato fresco" };
  if (Math.abs(v) < UMBRAL) return { flecha: "flat", label: `casi sin cambios (${v >= 0 ? "+" : "−"}${pct1(v)}%)` };
  return v > 0 ? { flecha: "up", label: `sube ${pct1(v)}%` } : { flecha: "down", label: `baja ${pct1(v)}%` };
}
/** "subió 0,9%" | "bajó 1,0%" | "quedó sin cambios" | null (sin cierre previo) */
function verbo(g: CotizacionGrano): string | null {
  if (g.pct == null || !Number.isFinite(g.pct)) return null;
  const p = pct1(g.pct);
  if (p === "0,0") return "quedó sin cambios";
  return g.pct > 0 ? `subió ${p}%` : `bajó ${p}%`;
}
function granoDe(p: PlazaSnapshot | undefined, g: "soja" | "maiz" | "trigo"): CotizacionGrano | null {
  if (!p || p.frescura === "vencido") return null;
  return p.granos.find((x) => x.grano === g && x.unidad === "ARS/t") ?? null;
}
function horaLeido(hora: string | null | undefined): string | null {
  return hora?.match(/(\d{2}:\d{2})/)?.[1] ?? null;
}

function seccionGrano(mercado: MercadoSnapshot, g: "soja" | "maiz" | "trigo"): CardSection {
  const L = LABEL[g];
  const cbot = mercado.rows.find((r) => r.id === `chicago-${g}`);
  const afa = granoDe(mercado.plazas?.afa, g);
  const cac = granoDe(mercado.plazas?.cac, g);
  const v = cbot?.valor ? cbot.varPct : null;
  if (v == null || !Number.isFinite(v) || !cbot?.valor) {
    return {
      flecha: "flat",
      flechaLabel: "sin dato Chicago",
      titulo: `${L} · sin dato Chicago`,
      resumen: "Sin cotización de Chicago en el feed.",
      fuente: "CBOT",
      hora: null,
    };
  }
  const f = flechaUmbral(v);
  const sube = v > 0;
  const chi = Math.abs(v) < UMBRAL ? "Chicago estable" : sube ? "Chicago sube" : "Chicago baja";
  let titulo = `${L} · ${chi}`;
  if (Math.abs(v) >= UMBRAL && cac?.pct != null && Math.abs(cac.pct) >= UMBRAL && (cac.pct > 0) !== sube) {
    titulo = `${L} · ${sube ? "Chicago sube, local flojo" : "Chicago baja, local firme"}`;
  }
  const leido = horaLeido(cbot.hora);
  const partes: string[] = [];
  partes.push(
    `Chicago ${sube ? "sube" : "cae"} ${pct1(v)}% a ${cbot.valor} USD/t (precio demorado${leido ? `, leído ${leido}` : ""}).`,
  );
  const fis: string[] = [];
  if (afa) {
    const vb = verbo(afa);
    fis.push(vb ? `AFA ${vb} a ${n0(afa.valor)} $/t el ${dm(afa.fecha)}` : `AFA marcó ${n0(afa.valor)} $/t el ${dm(afa.fecha)}`);
  }
  if (cac) {
    const vb = verbo(cac);
    fis.push(vb ? `la CAC del ${dm(cac.fecha)} ${vb} a ${n0(cac.valor)} $/t` : `la CAC del ${dm(cac.fecha)} marcó ${n0(cac.valor)} $/t`);
  }
  if (fis.length === 2) partes.push(`En el físico, ${fis[0]}, y ${fis[1]}.`);
  else if (fis.length === 1) partes.push(`En el físico, ${fis[0].replace(/^la CAC/, "la CAC")}.`);
  const fuentes = ["CBOT", afa ? "AFA" : null, cac ? "CAC" : null].filter(Boolean) as string[];
  partes.push(`Fuentes: ${fuentes.length > 1 ? `${fuentes.slice(0, -1).join(", ")} y ${fuentes[fuentes.length - 1]}` : fuentes[0]}.`);
  return {
    flecha: f.flecha,
    flechaLabel: f.label,
    titulo,
    resumen: partes.join(" "),
    fuente: fuentes.join(" · "),
    hora: leido ? `leído ${leido}` : null,
  };
}

type Cond = "despejado" | "nublado" | "lluvia";
function condDe(code: number | null): Cond | null {
  if (code == null) return null;
  if (code <= 1) return "despejado";
  if (code <= 48) return "nublado";
  return "lluvia";
}

function seccionClima(clima: ClimaVivoSnapshot | null): { s: CardSection; code: number | null } {
  const con = (clima?.ciudades ?? []).filter((c) => c.tempC != null && !c.error);
  const base = { flecha: "flat" as const, flechaLabel: "sin alerta en los datos" };
  if (con.length === 0) {
    return { s: { ...base, titulo: "Clima · sin dato", resumen: "Sin dato de clima vigente (más de 2 h o sin respuesta).", fuente: clima?.fuente ?? null, hora: null }, code: null };
  }
  const cnt = new Map<Cond, number>();
  for (const c of con) {
    const k = condDe(c.code);
    if (k) cnt.set(k, (cnt.get(k) ?? 0) + 1);
  }
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  const cond: string = top.length === 0 ? "condición sin dato" : top.length > 1 && top[0][1] === top[1][1] ? "condiciones variables" : top[0][0];
  const temps = con.map((c) => c.tempC!);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const hora = con.map((c) => c.horaDato?.slice(11, 16)).filter(Boolean).sort().pop() ?? null;
  const nombres = con.map((c) => c.nombre);
  const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres[0];
  const rango = min === max ? `${n1(min)} °C` : `entre ${n1(min)} y ${n1(max)} °C`;
  const code = con.find((c) => condDe(c.code) === top[0]?.[0])?.code ?? con[0].code;
  return {
    s: {
      ...base,
      titulo: `Clima · ${cond} en la zona núcleo`,
      resumen: `${lista}: ${cond}, ${rango}${hora ? ` a las ${hora}` : ""}. Fuente: ${clima?.fuente ?? "Open-Meteo (modelo)"}.`,
      fuente: clima?.fuente ?? null,
      hora: hora ? `${hora} ART` : null,
    },
    code,
  };
}

function seccionDolar(mercado: MercadoSnapshot): CardSection {
  const bna = mercado.plazas?.fxBnaDivisa ?? null;
  const prev = mercado.plazas?.fxBnaDivisaPrev ?? null;
  if (!bna) {
    return { flecha: "flat", flechaLabel: "sin dato", titulo: "Dólar · sin dato BNA", resumen: "Sin cotización BNA divisa en el feed.", fuente: "BNA", hora: null };
  }
  const v = prev && prev.valor > 0 ? bna.valor / prev.valor - 1 : null;
  const f = flechaUmbral(v);
  const titulo = v == null ? "Dólar · BNA sin cierre previo" : Math.abs(v) < UMBRAL ? "Dólar · BNA casi sin cambios" : v > 0 ? "Dólar · BNA sube" : "Dólar · BNA baja";
  const val = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  const cmp = prev && v != null ? `, contra $${val(prev.valor)} del ${dm(prev.fecha)} (${v >= 0 ? "+" : "−"}${pct1(v)}%)` : "";
  return {
    flecha: f.flecha,
    flechaLabel: f.label,
    titulo,
    resumen: `El dólar BNA divisa comprador cerró el ${dm(bna.fecha)} en $${val(bna.valor)}${cmp}. Es el tipo de cambio que usamos para pasar las pizarras a dólares. Fuente: BNA.`,
    fuente: "BNA divisa comprador",
    hora: dm(bna.fecha),
  };
}

export async function buildLecturaCards(
  mercado: MercadoSnapshot,
  fiscal: FiscalSnapshot,
  clima: ClimaVivoSnapshot | null,
): Promise<LecturaCard[]> {
  const hoy = hoyArtIso();
  const cl = seccionClima(clima);
  return [
    ...(["soja", "maiz", "trigo"] as const).map(
      (g): LecturaCard => ({ id: g, icon: { kind: "grano", grano: g }, sections: [seccionGrano(mercado, g)] }),
    ),
    { id: "clima", icon: { kind: "clima", code: cl.code }, sections: [cl.s] },
    { id: "dolar-fiscal", icon: { kind: "dolar" }, sections: [seccionDolar(mercado), seccionFiscal(fiscal, hoy)] },
  ];
}
