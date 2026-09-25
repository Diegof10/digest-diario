import {
  climaFechaLabel,
  climaFuenteLabel,
  climaResumen,
  getClima,
} from "@/lib/clima";
import { frescura, hoyArtIso, isoToDmy, REGLAS } from "@/lib/habiles";
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

type GranosMatba = {
  id: string;
  label: string;
  contract: string;
  value: number;
  change: number | null;
  volume?: number;
  openInterest?: number;
  asOf?: string;
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
  matba?: GranosMatba[];
  matbaAsOf?: string;
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

function pickCbot(list: GranosCbot[] | undefined, id: string): GranosCbot | null {
  return list?.find((c) => c.id === id) ?? null;
}

function pickMatba(
  list: GranosMatba[] | undefined,
  pred: (m: GranosMatba) => boolean,
): GranosMatba | null {
  return list?.find(pred) ?? null;
}

function mapGranos(data: GranosPayload): MercadoSnapshot {
  const asOf = data.asOf ?? null;
  const hora = horaArg(asOf);
  const rows: MercadoRow[] = [];
  const sourcesOk =
    data.sources?.filter((s) => s.ok).map((s) => s.label) ?? [];

  // Chicago / CBOT
  const cbotMap: Array<{
    id: string;
    ticker: string;
    producto: string;
  }> = [
    { id: "chicago-soja", ticker: "ZS=F", producto: "Soja" },
    { id: "chicago-maiz", ticker: "ZC=F", producto: "Maíz" },
    { id: "chicago-trigo", ticker: "ZW=F", producto: "Trigo" },
  ];
  for (const slot of cbotMap) {
    const c = pickCbot(data.cbot, slot.ticker);
    if (c && Number.isFinite(c.value)) {
      const pct = fmtPct(c.change);
      rows.push(
        filled({
          id: slot.id,
          mercado: "Chicago nocturno",
          producto: slot.producto,
          valor: fmtNum(c.value, 1),
          unidad: "US$/t",
          fuente: "Yahoo CBOT",
          hora,
          varPct: c.change,
          extra: [c.hint, pct].filter(Boolean).join(" · ") || null,
        }),
      );
    } else {
      rows.push(emptyRow(slot.id, "Chicago nocturno", slot.producto));
    }
  }

  // Cierres CBOT (same source — mirror with clear label)
  for (const slot of cbotMap) {
    const c = pickCbot(data.cbot, slot.ticker);
    const cid =
      slot.producto === "Soja"
        ? "cbot-soja"
        : slot.producto === "Maíz"
          ? "cbot-maiz"
          : "cbot-trigo";
    if (c && Number.isFinite(c.value)) {
      rows.push(
        filled({
          id: cid,
          mercado: "Cierres CBOT",
          producto: slot.producto,
          valor: fmtNum(c.value, 1),
          unidad: "US$/t",
          fuente: "Yahoo CBOT",
          hora,
          varPct: c.change,
          extra: c.hint ?? null,
        }),
      );
    } else {
      rows.push(emptyRow(cid, "Cierres CBOT", slot.producto));
    }
  }

  // Matba futuros: soja May/Nov, maíz, trigo
  const matbaHora = data.matbaAsOf
    ? horaArg(`${data.matbaAsOf}T12:00:00-03:00`)
    : hora;
  const matbaSlots: Array<{
    id: string;
    producto: string;
    pick: (m: GranosMatba) => boolean;
  }> = [
    {
      id: "matba-soja-may",
      producto: "Soja May",
      pick: (m) => /soja/i.test(m.id) && /MAY/i.test(m.contract),
    },
    {
      id: "matba-soja-nov",
      producto: "Soja Nov",
      pick: (m) => /soja/i.test(m.id) && /NOV/i.test(m.contract),
    },
    {
      id: "matba-maiz",
      producto: "Maíz",
      pick: (m) => /maiz/i.test(m.id),
    },
    {
      id: "matba-trigo",
      producto: "Trigo",
      pick: (m) => /trigo/i.test(m.id),
    },
  ];
  for (const slot of matbaSlots) {
    const m = pickMatba(data.matba, slot.pick);
    if (m && Number.isFinite(m.value)) {
      rows.push(
        filled({
          id: slot.id,
          mercado: "A3/Matba futuros",
          producto: slot.producto,
          valor: fmtNum(m.value, 1),
          unidad: "US$/t",
          fuente: "Matba",
          hora: matbaHora,
          fecha: m.asOf ?? data.matbaAsOf ?? null,
          varPct: m.change,
          contrato: m.contract,
          extra: fmtPct(m.change),
        }),
      );
    } else {
      rows.push(emptyRow(slot.id, "A3/Matba futuros", slot.producto));
    }
  }

  // Plazas físicas (Pizarra CAC Rosario / AFA San Martín / FOB Up River):
  // se agregan en applyPlazas() desde fuentes directas (src/lib/plazas.ts).

  // Pizarra MAGYP (FAS) eliminada: estaba clavada y duplicaba CAC Rosario.

  // BNA FX
  if (data.fxBna != null && Number.isFinite(data.fxBna)) {
    rows.push(
      filled({
        id: "fx-bna",
        mercado: "FX",
        producto: "BNA",
        valor: fmtNum(data.fxBna, 0),
        unidad: "ARS/USD",
        fuente: "BNA",
        hora,
      }),
    );
  } else {
    rows.push(emptyRow("fx-bna", "FX", "BNA"));
  }

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
    fxBna: data.fxBna ?? null,
    wasdeHeadline: wasde?.headline ?? null,
    progressHeadline: progress?.headline ?? null,
    sourcesOk,
    clima: null,
    noticias: null,
  };
}

function stubSnapshot(note: string): MercadoSnapshot {
  const slots = [
    ["chicago-soja", "Chicago nocturno", "Soja"],
    ["chicago-maiz", "Chicago nocturno", "Maíz"],
    ["chicago-trigo", "Chicago nocturno", "Trigo"],
    ["cbot-soja", "Cierres CBOT", "Soja"],
    ["cbot-maiz", "Cierres CBOT", "Maíz"],
    ["cbot-trigo", "Cierres CBOT", "Trigo"],
    ["matba-soja-may", "A3/Matba futuros", "Soja May"],
    ["matba-soja-nov", "A3/Matba futuros", "Soja Nov"],
    ["matba-maiz", "A3/Matba futuros", "Maíz"],
    ["matba-trigo", "A3/Matba futuros", "Trigo"],
    ["fx-bna", "FX", "BNA"],
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

const GRANO_LABEL = { soja: "Soja", maiz: "Maíz", trigo: "Trigo" } as const;

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
      hora: fechaLabel,
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
  return rows;
}

function applyPlazas(snap: MercadoSnapshot, plazas: PlazasSnapshot | null): MercadoSnapshot {
  const rest = snap.rows.filter((r) => !/^(cac|afa|fob)-/.test(r.id));
  if (!plazas) return { ...snap, rows: rest, plazas: null };
  const rows = [
    ...plazaRows(plazas.cac),
    ...plazaRows(plazas.afa),
    ...plazaRows(plazas.fob),
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

export async function getMercado(opts: { fresh?: boolean } = {}): Promise<MercadoSnapshot> {
  const climaPromise = getClima();
  const noticiasPromise = getNoticias();
  const wtiPromise = fetchWti();
  const plazasPromise = getPlazas({ fresh: opts.fresh }).catch(() => null);
  let base: MercadoSnapshot;
  try {
    const res = await fetch(GRANOS_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
      cache: "no-store",
    });
    base = res.ok
      ? mapGranos((await res.json()) as GranosPayload)
      : stubSnapshot(
          `Feed granos HTTP ${res.status}. Celdas vacías — no se inventan precios.`,
        );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    base = stubSnapshot(
      `Error feed granos: ${msg}. Celdas vacías — no se inventan precios.`,
    );
  }
  const [clima, noticias, wti, plazas] = await Promise.all([
    climaPromise,
    noticiasPromise,
    wtiPromise,
    plazasPromise,
  ]);
  return applyFrescura(
    applyPlazas(applyWti(applyNoticias(applyClima(base, clima), noticias), wti), plazas),
  );
}

export function rowById(rows: MercadoRow[], id: string): MercadoRow | undefined {
  return rows.find((r) => r.id === id);
}
