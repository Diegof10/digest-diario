import { aUsdTon, fetchCierresCbot, type CierreCbot, type GranoCbot } from "@/lib/cbot";
import {
  climaFechaLabel,
  climaFuenteLabel,
  climaResumen,
  getClima,
} from "@/lib/clima";
import { getFobFas, type FobFasSnapshot, type GranoOficial } from "@/lib/fob-fas";
import { frescura, hoyArtIso, isoToDm, isoToDmy, REGLAS } from "@/lib/habiles";
import { getMatba, type MatbaSnapshot } from "@/lib/matba";
import { getNoticias } from "@/lib/noticias";
import {
  fmtPrecio,
  fmtVar,
  getPlazas,
  type PlazaSnapshot,
  type PlazasSnapshot,
} from "@/lib/plazas";
import type {
  ClimaSnapshot,
  MercadoRow,
  MercadoSnapshot,
  NoticiasSnapshot,
  SenalMercado,
} from "@/lib/types";

const GRANOS_URL = "https://lark-lake-solar-craft.grok.me/api/granos";
/**
 * El feed externo (USDA y respaldo) desde Vercel no responde antes de ~10 s y el cron
 * cortaba ahí (`AbortSignal` de 10 s → corridas de ~10,5 s). 20 s entra en maxDuration=60
 * y no se reintenta un abort: un segundo intento sólo duplicaba la espera.
 */
const GRANOS_TIMEOUT_MS = 20_000;
const WTI_TIMEOUT_MS = 6_000;

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.1; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type GranosCbot = {
  id: string;
  label: string;
  value: number;
  change: number | null;
  hint?: string;
};

type GranosLocal = {
  plaza: string;
  hint?: string;
  soja?: number | null;
  maiz?: number | null;
  trigo?: number | null;
  girasol?: number | null;
  unit?: string;
};

type GranosFas = {
  grain: string;
  label: string;
  pizarra?: number | null;
  fas?: number | null;
  asOf?: string;
};

type GranosUsdaBlock = {
  kind?: string;
  title?: string;
  published?: string;
  period?: string;
  headline?: string;
  bullets?: string[];
};

type GranosPayload = {
  asOf?: string;
  sources?: Array<{ id: string; label: string; ok: boolean }>;
  fxBna?: number | null;
  cbot?: GranosCbot[];
  local?: GranosLocal[];
  fas?: GranosFas[];
  usda?: {
    wasde?: GranosUsdaBlock;
    progress?: GranosUsdaBlock;
  };
};

function senalFromChange(change: number | null | undefined): SenalMercado | null {
  if (change == null || !Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.0005) return "→";
  return change > 0 ? "↑" : "↓";
}

function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(change: number | null | undefined): string | null {
  if (change == null || !Number.isFinite(change)) return null;
  const pct = change * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function horaArg(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Cordoba",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return null;
  }
}

function emptyRow(
  id: string,
  mercado: string,
  producto: string,
): MercadoRow {
  return {
    id,
    mercado,
    producto,
    valor: null,
    unidad: null,
    fuente: null,
    hora: null,
    etiqueta: "VACÍO",
    varPct: null,
    senal: null,
    extra: null,
    contrato: null,
  };
}

function filled(
  base: Omit<MercadoRow, "valor" | "unidad" | "fuente" | "hora" | "etiqueta" | "varPct" | "senal"> & {
    valor: string;
    unidad: string;
    fuente: string;
    hora: string | null;
    varPct?: number | null;
    extra?: string | null;
    contrato?: string | null;
    fecha?: string | null;
  },
): MercadoRow {
  return {
    ...base,
    etiqueta: "HECHO",
    senal: senalFromChange(base.varPct),
    varPct: base.varPct ?? null,
    extra: base.extra ?? null,
    contrato: base.contrato ?? null,
    fecha: base.fecha ?? null,
  };
}

/** Posiciones Matba del tablero (contrato vivo más cercano de cada mes; ver src/lib/matba.ts). */
const MATBA_SLOTS = [
  { id: "matba-soja-may", producto: "Soja May", grano: "soja", mes: "MAY" },
  { id: "matba-soja-nov", producto: "Soja Nov", grano: "soja", mes: "NOV" },
  { id: "matba-maiz", producto: "Maíz Abr", grano: "maiz", mes: "ABR" },
  { id: "matba-maiz-dic", producto: "Maíz Dic", grano: "maiz", mes: "DIC" },
  { id: "matba-trigo", producto: "Trigo Ene", grano: "trigo", mes: "ENE" },
] as const;

/** Rellena las filas Matba con ajustes oficiales A3; sin dato → vacío con la última fecha real. */
function applyMatba(snap: MercadoSnapshot, m: MatbaSnapshot): MercadoSnapshot {
  const rows = snap.rows.map((r) => {
    const slot = MATBA_SLOTS.find((x) => x.id === r.id);
    if (!slot) return r;
    const c = m.contratos.find((x) => x.grano === slot.grano && x.mes === slot.mes);
    if (!c) {
      return {
        ...emptyRow(slot.id, "A3/Matba futuros", slot.producto),
        fuente: "A3 Matba",
        extra: m.error ? `sin dato · A3: ${m.error}` : "sin dato",
      };
    }
    const base: MercadoRow = {
      id: slot.id,
      mercado: "A3/Matba futuros",
      producto: slot.producto,
      valor: fmtNum(c.value, 1),
      unidad: "US$/t",
      fuente: m.origen === "blob" ? "A3 Matba ajuste (guardado)" : "A3 Matba ajuste",
      hora: isoToDmy(c.asOf),
      etiqueta: "HECHO",
      varPct: c.change,
      senal: senalFromChange(c.change),
      extra: fmtPct(c.change),
      contrato: c.contract,
      url: m.fuenteUrl,
      fecha: c.asOf,
      frescura: c.frescura,
    };
    if (c.frescura === "vencido") {
      return {
        ...base,
        valor: null,
        unidad: null,
        senal: null,
        varPct: null,
        etiqueta: "VACÍO" as const,
        extra: `sin dato fresco · último ajuste ${c.contract} ${isoToDm(c.asOf)}`,
      };
    }
    return base;
  });
  return { ...snap, rows, matba: m };
}

function mapGranos(data: GranosPayload): MercadoSnapshot {
  const asOf = data.asOf ?? null;
  const rows: MercadoRow[] = [];
  const sourcesOk =
    data.sources?.filter((s) => s.ok).map((s) => s.label) ?? [];

  // Chicago: una sola fila por grano. El precio y la fecha de cierre los pone applyCbot
  // (velas diarias de Yahoo). No se duplica como cbot-* ni se usa la cotización sin fecha del feed.
  for (const slot of [
    ["chicago-soja", "Soja"],
    ["chicago-maiz", "Maíz"],
    ["chicago-trigo", "Trigo"],
  ] as const) {
    rows.push(emptyRow(slot[0], "Chicago · cierre CBOT", slot[1]));
  }

  // Matba futuros: NO se toman del feed externo (traía números clavados, p. ej.
  // soja May-27 332,5 con fecha de hoy). Se rellenan en applyMatba() con los
  // ajustes oficiales de A3 (src/lib/matba.ts), cada uno con su fecha de rueda.
  for (const slot of MATBA_SLOTS) {
    rows.push(emptyRow(slot.id, "A3/Matba futuros", slot.producto));
  }

  // Plazas físicas (Pizarra CAC Rosario / AFA San Martín):
  // se agregan en applyPlazas() desde fuentes directas (src/lib/plazas.ts).

  // Pizarra MAGYP (FAS) eliminada: estaba clavada y duplicaba CAC Rosario.

  // Tipos de cambio: los completa applyFx con la fuente y el nombre de cada uno.
  // El número suelto del feed (billete venta) no se muestra acá sin etiqueta.
  rows.push(emptyRow("fx-a3500", "FX", "BCRA A3500"));
  rows.push(emptyRow("fx-bna", "FX", "BNA billete venta"));

  // USDA / WASDE
  const wasde = data.usda?.wasde;
  if (wasde?.headline) {
    rows.push(
      filled({
        id: "usda",
        mercado: "USDA/WASDE",
        producto: "Reporte",
        valor: wasde.headline.slice(0, 120) + (wasde.headline.length > 120 ? "…" : ""),
        unidad: "",
        fuente: "USDA WASDE",
        hora: wasde.published ?? null,
        extra: wasde.period ?? wasde.title ?? null,
      }),
    );
  } else {
    rows.push(emptyRow("usda", "USDA/WASDE", "Reporte"));
  }

  // Crop Progress (extra row)
  const progress = data.usda?.progress;
  if (progress?.headline) {
    rows.push(
      filled({
        id: "crop-progress",
        mercado: "Crop Progress",
        producto: "Condición",
        valor:
          progress.headline.slice(0, 120) +
          (progress.headline.length > 120 ? "…" : ""),
        unidad: "",
        fuente: "USDA Crop Progress",
        hora: progress.published ?? null,
      }),
    );
  } else {
    rows.push(emptyRow("crop-progress", "Crop Progress", "Condición"));
  }

  // Noticias / WTI — sin fuente → vacío; clima se rellena en getMercado
  rows.push(emptyRow("noticias", "Noticias", "Agro"));
  rows.push(emptyRow("clima", "Clima", "AR/BR/US"));
  rows.push(emptyRow("wti", "Energía", "WTI"));

  const filledCount = rows.filter((r) => r.valor != null).length;
  const noteParts: string[] = [];
  if (wasde?.headline) noteParts.push(wasde.headline);
  if (progress?.headline) noteParts.push(progress.headline);
  if (wasde?.bullets?.length) {
    noteParts.push(...wasde.bullets.slice(0, 3));
  }

  return {
    ok: filledCount > 0,
    rows,
    note:
      noteParts.length > 0
        ? noteParts.join(" ")
        : filledCount > 0
          ? `Feed granos · ${filledCount} filas con valor`
          : "Sin datos del feed granos",
    fetchedAt: new Date().toISOString(),
    asOf,
    fxBna: null,
    wasdeHeadline: wasde?.headline ?? null,
    progressHeadline: progress?.headline ?? null,
    sourcesOk,
    clima: null,
    noticias: null,
  };
}

function stubSnapshot(note: string): MercadoSnapshot {
  const slots = [
    ["chicago-soja", "Chicago · cierre CBOT", "Soja"],
    ["chicago-maiz", "Chicago · cierre CBOT", "Maíz"],
    ["chicago-trigo", "Chicago · cierre CBOT", "Trigo"],
    ...MATBA_SLOTS.map((m) => [m.id, "A3/Matba futuros", m.producto] as const),
    ["fx-a3500", "FX", "BCRA A3500"],
    ["fx-bna", "FX", "BNA billete venta"],
    ["usda", "USDA/WASDE", "Reporte"],
    ["crop-progress", "Crop Progress", "Condición"],
    ["noticias", "Noticias", "Agro"],
    ["clima", "Clima", "AR/BR/US"],
    ["wti", "Energía", "WTI"],
  ] as const;
  return {
    ok: false,
    rows: slots.map(([id, mercado, producto]) => emptyRow(id, mercado, producto)),
    note,
    fetchedAt: new Date().toISOString(),
    asOf: null,
    fxBna: null,
    wasdeHeadline: null,
    progressHeadline: null,
    sourcesOk: [],
    clima: null,
    noticias: null,
  };
}

function applyClima(snap: MercadoSnapshot, clima: ClimaSnapshot): MercadoSnapshot {
  const rows = snap.rows.map((r) => {
    if (r.id !== "clima") return r;
    if (!clima.ok || clima.entries.length === 0) return r;
    const resumen = climaResumen(clima);
    return {
      ...r,
      valor: resumen.length > 220 ? resumen.slice(0, 217) + "…" : resumen,
      unidad: "",
      fuente: climaFuenteLabel(clima),
      hora: climaFechaLabel(clima),
      etiqueta: clima.etiqueta,
      url: clima.entries[0]?.url ?? null,
      extra: clima.note,
    };
  });
  const filledCount = rows.filter((r) => r.valor != null).length;
  return {
    ...snap,
    rows,
    ok: filledCount > 0 || snap.ok,
    clima,
  };
}


const YAHOO_WTI_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=5d";

type WtiQuote = {
  price: number;
  prevClose: number;
  varPct: number;
  asOfIso: string;
};

async function fetchWti(): Promise<WtiQuote | null> {
  try {
    const res = await fetch(YAHOO_WTI_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(WTI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; regularMarketTime?: number };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
      (c): c is number => c != null && Number.isFinite(c),
    );
    const metaPrice = result.meta?.regularMarketPrice;
    const price =
      metaPrice != null && Number.isFinite(metaPrice)
        ? metaPrice
        : closes.length
          ? closes[closes.length - 1]
          : null;
    if (price == null) return null;
    // Variación diaria = vs cierre de la sesión anterior (últimos 2 closes)
    const prevClose =
      closes.length >= 2
        ? closes[closes.length - 2]
        : closes.length === 1
          ? closes[0]
          : null;
    if (prevClose == null || prevClose === 0) return null;
    const varPct = price / prevClose - 1;
    const t = result.meta?.regularMarketTime;
    const asOfIso =
      t != null
        ? new Date(t * 1000).toISOString()
        : new Date().toISOString();
    return { price, prevClose, varPct, asOfIso };
  } catch {
    return null;
  }
}


function applyNoticias(
  snap: MercadoSnapshot,
  noticias: NoticiasSnapshot,
): MercadoSnapshot {
  const rows = snap.rows.map((r) => {
    if (r.id !== "noticias") return r;
    if (!noticias.ok || !noticias.valor) return r;
    return {
      ...r,
      valor: noticias.valor,
      unidad: "",
      fuente: noticias.fuente,
      hora: noticias.hora,
      etiqueta: noticias.etiqueta,
      url: noticias.url,
      extra: noticias.extra,
    };
  });
  const filledCount = rows.filter((r) => r.valor != null).length;
  return {
    ...snap,
    rows,
    ok: filledCount > 0 || snap.ok,
    noticias,
  };
}

function applyWti(snap: MercadoSnapshot, wti: WtiQuote | null): MercadoSnapshot {
  if (!wti) return snap;
  const pctLabel = fmtPct(wti.varPct);
  const rows = snap.rows.map((r) => {
    if (r.id !== "wti") return r;
    return filled({
      id: "wti",
      mercado: "Energía",
      producto: "WTI",
      valor: fmtNum(wti.price, 2),
      unidad: "US$/bbl",
      fuente: "Yahoo CL=F",
      hora: horaArg(wti.asOfIso),
      fecha: hoyArtIso(new Date(wti.asOfIso)),
      varPct: wti.varPct,
      extra: [
        pctLabel,
        `prev ${fmtNum(wti.prevClose, 2)}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  });
  const filledCount = rows.filter((r) => r.valor != null).length;
  return {
    ...snap,
    rows,
    ok: filledCount > 0 || snap.ok,
  };
}

const GRANO_LABEL = { soja: "Soja", maiz: "Maíz", trigo: "Trigo", girasol: "Girasol", sorgo: "Sorgo" } as const;

/** Filas de plazas físicas desde fuentes directas; nunca rellena huecos. */
function plazaRows(p: PlazaSnapshot): MercadoRow[] {
  const rows: MercadoRow[] = [];
  for (const g of p.granos) {
    const fechaLabel = isoToDmy(g.fecha);
    const est = frescura(g.fecha, REGLAS[p.id]);
    const base: MercadoRow = {
      id: `${p.id}-${g.grano}`,
      mercado: p.nombre,
      producto: GRANO_LABEL[g.grano],
      valor: null,
      unidad: g.unidad === "ARS/t" ? "ARS/t" : "US$/t",
      fuente: p.fuente,
      hora: g.hora ? `${fechaLabel} ${g.hora}` : fechaLabel,
      etiqueta: "HECHO",
      varPct: null,
      senal: null,
      extra: null,
      contrato: null,
      url: p.url,
      fecha: g.fecha,
      frescura: est,
      varAbs: null,
      valorUsd: null,
      tc: null,
      prevFecha: g.prev?.fecha ?? null,
      lugar: g.lugar ?? null,
    };
    if (est === "vencido") {
      rows.push({
        ...base,
        unidad: null,
        etiqueta: "VACÍO",
        extra: `sin dato fresco · última fuente ${fechaLabel}`,
      });
      continue;
    }
    const v = fmtVar(g);
    rows.push({
      ...base,
      valor: fmtPrecio(g),
      varPct: g.pct,
      senal: senalFromChange(g.pct),
      varAbs: v,
      extra: [
        v ? `${v} vs ${isoToDmy(g.prev?.fecha).slice(0, 5)}` : "sin cierre previo",
        g.estimativo ? "precio estimativo (E)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      valorUsd:
        g.usd != null
          ? g.usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : null,
      tc: g.tc
        ? `${g.tc.fuente} ${isoToDmy(g.tc.fecha).slice(0, 5)}: ${g.tc.valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`
        : null,
    });
  }
  // Producto publicado por la fuente ese día sin precio: "sin cotización" (nunca se inventa un valor).
  for (const s of p.sinCotizacion ?? []) {
    const fechaLabel = isoToDmy(s.fecha);
    rows.push({
      id: `${p.id}-${s.grano}`,
      mercado: p.nombre,
      producto: GRANO_LABEL[s.grano],
      valor: null,
      unidad: null,
      fuente: p.fuente,
      hora: fechaLabel,
      etiqueta: "VACÍO",
      extra: `sin cotización · ${fechaLabel}`,
      url: p.url,
      fecha: s.fecha,
      frescura: frescura(s.fecha, REGLAS[p.id]),
      lugar: s.lugar,
    });
  }
  return rows;
}

function applyPlazas(snap: MercadoSnapshot, plazas: PlazasSnapshot | null): MercadoSnapshot {
  const rest = snap.rows.filter((r) => !/^(cac|afa|aca|fob)-/.test(r.id));
  if (!plazas) return { ...snap, rows: rest, plazas: null };
  const rows = [
    ...plazaRows(plazas.cac),
    ...plazaRows(plazas.afa),
    ...rest,
  ];
  return {
    ...snap,
    rows,
    ok: rows.some((r) => r.valor != null) || snap.ok,
    plazas,
  };
}

/** Frescura para filas de precio con fecha real de dato (Matba, WTI). >3 hábiles → se oculta. */
function applyFrescura(snap: MercadoSnapshot): MercadoSnapshot {
  const rows = snap.rows.map((r) => {
    if (!r.fecha || r.frescura || !r.valor) return r;
    const est = frescura(r.fecha);
    if (est === "vencido") {
      return {
        ...r,
        valor: null,
        unidad: null,
        senal: null,
        varPct: null,
        etiqueta: "VACÍO" as const,
        frescura: est,
        extra: `sin dato fresco · última fuente ${isoToDmy(r.fecha)}`,
      };
    }
    return { ...r, frescura: est };
  });
  return { ...snap, rows };
}

const CHICAGO: Array<{ id: string; grano: GranoCbot; producto: string }> = [
  { id: "chicago-soja", grano: "soja", producto: "Soja" },
  { id: "chicago-maiz", grano: "maiz", producto: "Maíz" },
  { id: "chicago-trigo", grano: "trigo", producto: "Trigo" },
];

/** Una fila por grano, con la fecha de cierre. No existe la copia cbot-*. */
function applyCbot(
  snap: MercadoSnapshot,
  cierres: Partial<Record<GranoCbot, CierreCbot | null>> | null,
): MercadoSnapshot {
  const rows = snap.rows
    .filter((r) => !r.id.startsWith("cbot-"))
    .map((r) => {
      const slot = CHICAGO.find((s) => s.id === r.id);
      if (!slot) return r;
      const c = cierres?.[slot.grano];
      if (!c) return { ...emptyRow(slot.id, "Chicago · cierre CBOT", slot.producto), extra: "sin cierre" };
      const usd = aUsdTon(slot.grano, c.centavos);
      const prev = c.prevCentavos != null ? aUsdTon(slot.grano, c.prevCentavos) : null;
      const varPct = prev && prev > 0 ? usd / prev - 1 : null;
      const est = frescura(c.fecha, REGLAS.cbot);
      const base: MercadoRow = {
        id: slot.id,
        mercado: "Chicago · cierre CBOT",
        producto: slot.producto,
        valor: fmtNum(usd, 1),
        unidad: "US$/t",
        fuente: "Yahoo Finance · cierre CBOT",
        hora: isoToDmy(c.fecha),
        etiqueta: "HECHO",
        varPct,
        senal: senalFromChange(varPct),
        extra: [
          `${fmtNum(c.centavos, 2)} ¢/bu`,
          fmtPct(varPct),
          c.enCursoDescartada ? "sesión de hoy todavía abierta" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: c.fecha,
        frescura: est,
        prevFecha: c.prevFecha,
      };
      if (est === "vencido") {
        return {
          ...base,
          valor: null,
          unidad: null,
          senal: null,
          varPct: null,
          etiqueta: "VACÍO" as const,
          extra: `sin dato fresco · último cierre ${isoToDm(c.fecha)}`,
        };
      }
      return base;
    });
  return { ...snap, rows };
}

function filaFx(
  id: string,
  producto: string,
  fuente: string,
  valor: number | null | undefined,
  fecha: string | null | undefined,
  digits: number,
): MercadoRow {
  if (valor == null || !Number.isFinite(valor) || !fecha) {
    return { ...emptyRow(id, "FX", producto), fuente, extra: "sin dato" };
  }
  return {
    ...filled({
      id,
      mercado: "FX",
      producto,
      valor: fmtNum(valor, digits),
      unidad: "ARS/USD",
      fuente,
      hora: isoToDmy(fecha),
      fecha,
    }),
    frescura: frescura(fecha),
  };
}

function applyFx(snap: MercadoSnapshot, plazas: PlazasSnapshot | null): MercadoSnapshot {
  const a = plazas?.fxA3500 ?? null;
  const b = plazas?.fxBilleteVenta ?? null;
  const rows = snap.rows.map((r) => {
    if (r.id === "fx-a3500") return filaFx(r.id, "BCRA A3500", a?.fuente ?? "BCRA A3500 · tipo de cambio de referencia", a?.valor, a?.fecha, 2);
    if (r.id === "fx-bna") return filaFx(r.id, "BNA billete venta", b?.fuente ?? "BNA billete venta (minorista)", b?.valor, b?.fecha, 0);
    return r;
  });
  return { ...snap, rows };
}

const FOB_LABEL: Record<GranoOficial, string> = {
  soja: "Soja",
  maiz: "Maíz",
  trigo: "Trigo",
  girasol: "Girasol",
  sorgo: "Sorgo",
};

/** Filas fob-* / fas-* con la fecha real. >3 días queda marcado y no se presenta como vigente. */
function applyFobFas(snap: MercadoSnapshot, fob: FobFasSnapshot | null): MercadoSnapshot {
  const rest = snap.rows.filter((r) => !/^(fob|fas)-/.test(r.id));
  if (!fob || fob.items.length === 0 || !fob.fecha) return { ...snap, rows: rest, fobFas: fob };
  const viejo = fob.antiguedad === "desactualizado";
  const extraRows: MercadoRow[] = [];
  for (const it of fob.items) {
    const marca = viejo ? `desactualizado · dato al ${isoToDm(fob.fecha)}` : null;
    if (it.fobUsd != null) {
      extraRows.push({
        id: `fob-${it.grano}`,
        mercado: "FOB oficial",
        producto: FOB_LABEL[it.grano],
        valor: fmtNum(it.fobUsd, 0),
        unidad: "US$/t",
        fuente: fob.fuente,
        hora: isoToDmy(fob.fecha),
        etiqueta: viejo ? "ÚLTIMO_GUARDADO" : "HECHO",
        fecha: fob.fecha,
        frescura: viejo ? "viejo" : "fresco",
        url: fob.url,
        extra: marca,
      });
    }
    if (it.fasArs != null) {
      extraRows.push({
        id: `fas-${it.grano}`,
        mercado: "FAS teórico",
        producto: FOB_LABEL[it.grano],
        valor: Math.round(it.fasArs).toLocaleString("es-AR"),
        unidad: "ARS/t",
        fuente: fob.fuente,
        hora: isoToDmy(fob.fecha),
        etiqueta: viejo ? "ÚLTIMO_GUARDADO" : "HECHO",
        fecha: fob.fecha,
        frescura: viejo ? "viejo" : "fresco",
        url: fob.url,
        extra: marca ?? (it.grano === "soja" || it.grano === "girasol" ? "FAS teórico (capacidad de pago)" : null),
      });
    }
  }
  return { ...snap, rows: [...extraRows, ...rest], fobFas: fob };
}

export async function getMercado(opts: { fresh?: boolean } = {}): Promise<MercadoSnapshot> {
  // Sólo el refresh "fresh" (cron) escribe la serie en Blob; las visitas sólo leen.
  const persist = opts.fresh === true;
  const climaPromise = getClima();
  const noticiasPromise = getNoticias();
  const wtiPromise = fetchWti();
  const plazasPromise = getPlazas({ fresh: opts.fresh, persist }).catch(() => null);
  const matbaPromise = getMatba({ fresh: opts.fresh, persist });
  const cbotPromise = fetchCierresCbot();
  const fobPromise = getFobFas();
  let base: MercadoSnapshot;
  let granosOk = false;
  try {
    const res = await fetch(GRANOS_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(GRANOS_TIMEOUT_MS),
    });
    if (res.ok) {
      base = mapGranos((await res.json()) as GranosPayload);
      granosOk = true;
    } else {
      base = stubSnapshot(`Feed granos HTTP ${res.status}. Celdas vacías — no se inventan precios.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    base = stubSnapshot(`Error feed granos: ${msg}. Celdas vacías — no se inventan precios.`);
  }
  const [clima, noticias, wti, plazas, matba, cierres, fob] = await Promise.all([
    climaPromise,
    noticiasPromise,
    wtiPromise,
    plazasPromise,
    matbaPromise,
    cbotPromise,
    fobPromise,
  ]);
  const snap = applyFrescura(
    applyFobFas(
      applyFx(
        applyCbot(
          applyMatba(
            applyPlazas(applyWti(applyNoticias(applyClima(base, clima), noticias), wti), plazas),
            matba,
          ),
          cierres,
        ),
        plazas,
      ),
      fob,
    ),
  );
  return { ...snap, sourcesOk: [...(snap.sourcesOk ?? []), granosOk ? "feed granos" : "feed granos (sin respuesta)"] };
}

export function rowById(rows: MercadoRow[], id: string): MercadoRow | undefined {
  return rows.find((r) => r.id === id);
}
