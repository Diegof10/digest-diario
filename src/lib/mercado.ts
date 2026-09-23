import type { MercadoRow, MercadoSnapshot, SenalMercado } from "@/lib/types";

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
  },
): MercadoRow {
  return {
    ...base,
    etiqueta: "HECHO",
    senal: senalFromChange(base.varPct),
    varPct: base.varPct ?? null,
    extra: base.extra ?? null,
    contrato: base.contrato ?? null,
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

  // Matba cosecha: soja May/Nov, maíz, trigo
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
          mercado: "A3/Matba cosecha",
          producto: slot.producto,
          valor: fmtNum(m.value, 1),
          unidad: "US$/t",
          fuente: "Matba",
          hora: matbaHora,
          varPct: m.change,
          contrato: m.contract,
          extra: fmtPct(m.change),
        }),
      );
    } else {
      rows.push(emptyRow(slot.id, "A3/Matba cosecha", slot.producto));
    }
  }

  // CAC Rosario
  const rosario =
    data.local?.find((l) => /rosario/i.test(l.plaza)) ?? data.local?.[0];
  const cacUnit =
    rosario?.unit === "usdt" || rosario?.unit === "USD/t" ? "US$/t" : "US$/t";
  const cacHora = rosario?.hint
    ? rosario.hint.replace(/^CAC\s*·\s*/i, "")
    : hora;
  const cacGrains: Array<{ id: string; key: "soja" | "maiz" | "trigo"; producto: string }> = [
    { id: "cac-soja", key: "soja", producto: "Soja" },
    { id: "cac-maiz", key: "maiz", producto: "Maíz" },
    { id: "cac-trigo", key: "trigo", producto: "Trigo" },
  ];
  for (const g of cacGrains) {
    const v = rosario?.[g.key];
    if (v != null && Number.isFinite(v)) {
      rows.push(
        filled({
          id: g.id,
          mercado: "CAC Rosario",
          producto: g.producto,
          valor: fmtNum(v, 2),
          unidad: cacUnit,
          fuente: "CAC Rosario",
          hora: cacHora,
          extra: rosario?.hint ?? null,
        }),
      );
    } else {
      rows.push(emptyRow(g.id, "CAC Rosario", g.producto));
    }
  }

  // Pizarra FAS (MAGYP) si hay
  const fasGrains: Array<{ grain: string; producto: string }> = [
    { grain: "soja", producto: "Soja" },
    { grain: "maiz", producto: "Maíz" },
    { grain: "trigo", producto: "Trigo" },
  ];
  for (const g of fasGrains) {
    const f = data.fas?.find((x) => x.grain === g.grain);
    const pz = f?.pizarra;
    if (pz != null && Number.isFinite(pz)) {
      rows.push(
        filled({
          id: `pizarra-${g.grain}`,
          mercado: "Pizarra Rosario",
          producto: g.producto,
          valor: fmtNum(pz, 2),
          unidad: "US$/t",
          fuente: "MAGYP pizarra",
          hora: f?.asOf ?? null,
        }),
      );
    } else {
      rows.push(emptyRow(`pizarra-${g.grain}`, "Pizarra Rosario", g.producto));
    }
  }

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

  // Noticias / clima / WTI — sin fuente → vacío
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
    ["matba-soja-may", "A3/Matba cosecha", "Soja May"],
    ["matba-soja-nov", "A3/Matba cosecha", "Soja Nov"],
    ["matba-maiz", "A3/Matba cosecha", "Maíz"],
    ["matba-trigo", "A3/Matba cosecha", "Trigo"],
    ["cac-soja", "CAC Rosario", "Soja"],
    ["cac-maiz", "CAC Rosario", "Maíz"],
    ["cac-trigo", "CAC Rosario", "Trigo"],
    ["pizarra-soja", "Pizarra Rosario", "Soja"],
    ["pizarra-maiz", "Pizarra Rosario", "Maíz"],
    ["pizarra-trigo", "Pizarra Rosario", "Trigo"],
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
  };
}

export async function getMercado(): Promise<MercadoSnapshot> {
  try {
    const res = await fetch(GRANOS_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return stubSnapshot(
        `Feed granos HTTP ${res.status}. Celdas vacías — no se inventan precios.`,
      );
    }
    const data = (await res.json()) as GranosPayload;
    return mapGranos(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return stubSnapshot(
      `Error feed granos: ${msg}. Celdas vacías — no se inventan precios.`,
    );
  }
}

export function rowById(rows: MercadoRow[], id: string): MercadoRow | undefined {
  return rows.find((r) => r.id === id);
}
