import type { CostoInsumoSlot, EtiquetaDato } from "@/lib/types";

/** SE Precios en Surtidor — Res. 314/2016 (retail pump, not canal Agro). */
export const SE_SURTIDOR_CSV_URL =
  "http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv";

/** IF vía Bichos de Campo — weekly RIF republished 19 Sep 2026. Curated snapshot only. */
export const FERT_SOURCE_URL =
  "https://bichosdecampo.com/doble-comando-en-el-mercado-de-fertilizantes-suben-los-nitrogenados-y-caen-los-valores-de-los-fosfatados/";

const FERT_AS_OF = "2026-09-19";
const FERT_SOURCE_LABEL = "Bichos/IF";

/** Campo Simple — lista web glifosato líquido eq.ác. ~54% (consulta 24 Sep 2026). */
export const GLIFO_SOURCE_URL =
  "https://www.camposimple.com.ar/default/herbicidas/glifosato.html";
const GLIFO_AS_OF = "2026-09-24";
const GLIFO_SOURCE_LABEL = "Campo Simple";
const GLIFO_LOW = 5.5; // genérico 66,2% eq.ác. 54% · 20 L
const GLIFO_HIGH = 5.9; // Power Plus II 54% · 20 L

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.1; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type InsumoPricePoint = {
  value: number | null;
  valueLow: number | null;
  valueHigh: number | null;
  unit: string;
  basis: string | null;
  channel: string | null;
  asOf: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  etiqueta: EtiquetaDato;
  note: string | null;
  nStations?: number | null;
  product?: string | null;
  brand?: string | null;
  horario?: string | null;
  geo?: string | null;
};

export type FertProductBlock = {
  local: InsumoPricePoint | null;
  import: InsumoPricePoint | null;
};

export type InsumosSnapshot = {
  ok: boolean;
  asOf: string;
  fetchedAt: string;
  fertilizantes: {
    urea: FertProductBlock;
    map: FertProductBlock;
    dap: FertProductBlock;
  };
  combustibles: {
    gasoil: InsumoPricePoint | null;
  };
  sources: Array<{ id: string; label: string; ok: boolean }>;
  /** Slots for CostsBlock / assembleDigest */
  slots: CostoInsumoSlot[];
  note: string;
};

function cordobaTodayYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** First day of current calendar month in Cordoba (YYYY-MM-01). */
function cordobaMonthStart(d = new Date()): string {
  const ymd = cordobaTodayYmd(d);
  return `${ymd.slice(0, 7)}-01`;
}

function fmtEsDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

function mid(low: number, high: number): number {
  return Math.round(((low + high) / 2) * 10) / 10;
}

function fmtRange(low: number, high: number, digits = 0): string {
  const a = low.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const b = high.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${a}–${b}`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function fertPoint(
  low: number,
  high: number,
  basis: string,
  channel: string,
  note: string | null = null,
): InsumoPricePoint {
  return {
    value: mid(low, high),
    valueLow: low,
    valueHigh: high,
    unit: "usd_t",
    basis,
    channel,
    asOf: FERT_AS_OF,
    sourceId: "if-rif",
    sourceUrl: FERT_SOURCE_URL,
    sourceLabel: FERT_SOURCE_LABEL,
    etiqueta: "ÚLTIMO_GUARDADO",
    note,
  };
}

/**
 * Curated weekly snapshot from Bichos de Campo / IF RIF dated 19 Sep 2026.
 * Not a live scrape — etiqueta ÚLTIMO_GUARDADO.
 */
function curatedFertilizantes(): InsumosSnapshot["fertilizantes"] {
  return {
    urea: {
      local: fertPoint(580, 600, "FCA", "wholesale"),
      import: fertPoint(515, 520, "CFR", "import_replacement"),
    },
    map: {
      local: fertPoint(
        970,
        1000,
        "FCA",
        "wholesale_bulk_port",
        "IF quotes MAP/DAP as combined FCA range",
      ),
      import: fertPoint(870, 880, "CFR", "import_replacement"),
    },
    dap: {
      local: fertPoint(
        970,
        1000,
        "FCA",
        "wholesale_bulk_port",
        "IF quotes MAP/DAP as combined FCA range",
      ),
      import: fertPoint(865, 870, "CFR", "import_replacement"),
    },
  };
}

type GasoilParse = {
  point: InsumoPricePoint | null;
  ok: boolean;
  error: string | null;
};

async function fetchGasoilRetail(): Promise<GasoilParse> {
  const cutoff = cordobaMonthStart();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(SE_SURTIDOR_CSV_URL, {
      headers: {
        "User-Agent": UA,
        Accept: "text/csv,*/*",
      },
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        point: null,
        ok: false,
        error: `HTTP ${res.status}`,
      };
    }
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      return { point: null, ok: false, error: "CSV vacío" };
    }

    const headerRaw = (lines[0] ?? "").replace(/^\uFEFF/, "");
    const header = parseCsvLine(headerRaw).map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const iBandera = idx("empresabandera");
    const iProducto = idx("producto");
    const iTurno = idx("tipohorario");
    const iPrecio = idx("precio");
    const iVigencia = idx("fecha_vigencia");
    if (
      iBandera < 0 ||
      iProducto < 0 ||
      iTurno < 0 ||
      iPrecio < 0 ||
      iVigencia < 0
    ) {
      return { point: null, ok: false, error: "CSV sin columnas esperadas" };
    }

    const prices: number[] = [];
    let maxVigencia: string | null = null;

    for (let li = 1; li < lines.length; li++) {
      const line = lines[li];
      if (!line || !line.trim()) continue;
      const cols = parseCsvLine(line);
      const bandera = (cols[iBandera] ?? "").toUpperCase();
      const producto = (cols[iProducto] ?? "").toLowerCase();
      const turno = (cols[iTurno] ?? "").trim().toLowerCase();
      const vigencia = (cols[iVigencia] ?? "").trim();
      const precioRaw = (cols[iPrecio] ?? "").replace(",", ".").trim();
      const precio = Number(precioRaw);

      if (!bandera.includes("YPF")) continue;
      if (!producto.includes("gas oil") && !producto.includes("gasoil")) {
        continue;
      }
      // Grado 2 / G2 (agricola retail proxy)
      if (!producto.includes("grado 2") && !/\bg2\b/.test(producto)) {
        continue;
      }
      if (turno !== "diurno") continue;
      if (!vigencia || vigencia < cutoff) continue;
      if (!Number.isFinite(precio) || precio <= 0) continue;

      prices.push(precio);
      const vigDay = vigencia.slice(0, 10);
      if (!maxVigencia || vigDay > maxVigencia) maxVigencia = vigDay;
    }

    const med = median(prices);
    if (med == null || prices.length === 0) {
      return {
        point: null,
        ok: false,
        error: `Sin filas YPF G2 Diurno vigencia>=${cutoff}`,
      };
    }

    const asOf = maxVigencia ?? cordobaTodayYmd();
    const point: InsumoPricePoint = {
      value: Math.round(med * 100) / 100,
      valueLow: null,
      valueHigh: null,
      unit: "ars_l",
      basis: null,
      channel: "retail_pump",
      asOf,
      sourceId: "se-surtidor",
      sourceUrl: SE_SURTIDOR_CSV_URL,
      sourceLabel: "SE Precios en Surtidor",
      etiqueta: "HECHO",
      note: `YPF Gas Oil Grado 2 Diurno · vigencia≥${cutoff} · n=${prices.length}`,
      nStations: prices.length,
      product: "Gas Oil Grado 2",
      brand: "YPF",
      horario: "Diurno",
      geo: "AR national median (estaciones con vigencia reciente)",
    };
    return { point, ok: true, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { point: null, ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

function buildSlots(
  fert: InsumosSnapshot["fertilizantes"],
  gasoil: InsumoPricePoint | null,
): CostoInsumoSlot[] {
  const urea = fert.urea.local;
  const map = fert.map.local;
  const dap = fert.dap.local;

  const fertFecha = fmtEsDate(FERT_AS_OF);
  const fertFuente = `${FERT_SOURCE_LABEL} · último valor guardado`;
  const glifoFecha = fmtEsDate(GLIFO_AS_OF);
  const glifoFuente = `${GLIFO_SOURCE_LABEL} · lista web`;

  return [
    {
      id: "urea",
      label: "Urea FCA",
      valor: urea
        ? fmtRange(urea.valueLow!, urea.valueHigh!)
        : null,
      unidad: "USD/t",
      fecha: urea ? fertFecha : null,
      fuente: urea ? fertFuente : null,
      etiqueta: urea ? "ÚLTIMO_GUARDADO" : "VACÍO",
    },
    {
      id: "map",
      label: "MAP FCA",
      valor: map ? fmtRange(map.valueLow!, map.valueHigh!) : null,
      unidad: "USD/t",
      fecha: map ? fertFecha : null,
      fuente: map ? fertFuente : null,
      etiqueta: map ? "ÚLTIMO_GUARDADO" : "VACÍO",
    },
    {
      id: "dap",
      label: "DAP FCA",
      valor: dap ? fmtRange(dap.valueLow!, dap.valueHigh!) : null,
      unidad: "USD/t",
      fecha: dap ? fertFecha : null,
      fuente: dap ? fertFuente : null,
      etiqueta: dap ? "ÚLTIMO_GUARDADO" : "VACÍO",
    },
    {
      id: "glifosato",
      label: "Glifosato 54%",
      valor: fmtRange(GLIFO_LOW, GLIFO_HIGH, 2),
      unidad: "USD/L",
      fecha: glifoFecha,
      fuente: glifoFuente,
      etiqueta: "ÚLTIMO_GUARDADO",
    },
    {
      id: "gasoil",
      label: "Gasoil (surtidor)",
      valor:
        gasoil?.value != null
          ? gasoil.value.toLocaleString("es-AR", {
              maximumFractionDigits: 0,
            })
          : null,
      unidad: "ARS/l",
      fecha: gasoil?.asOf ? fmtEsDate(gasoil.asOf) : null,
      fuente: gasoil
        ? `SE Surtidor · ${gasoil.channel ?? "retail_pump"}${
            gasoil.nStations != null ? ` · n=${gasoil.nStations}` : ""
          }`
        : null,
      etiqueta: gasoil ? gasoil.etiqueta : "VACÍO",
    },
  ];
}

export async function getInsumos(): Promise<InsumosSnapshot> {
  const fertilizantes = curatedFertilizantes();
  const gas = await fetchGasoilRetail();
  const fetchedAt = new Date().toISOString();
  const asOf = cordobaTodayYmd();

  const slots = buildSlots(fertilizantes, gas.point).filter(
    (s) => Boolean(s.valor && s.fuente && s.fecha),
  );

  const noteParts = [
    "Fertilizantes: snapshot curado IF vía Bichos (19/9/2026), no scrape en vivo.",
    gas.ok
      ? `Gasoil: mediana SE YPF G2 Diurno (retail_pump), n=${gas.point?.nStations}.`
      : `Gasoil: vacío (${gas.error ?? "sin dato"}).`,
    `Glifosato: ${GLIFO_LOW}–${GLIFO_HIGH} USD/L (Campo Simple lista web, consulta ${fmtEsDate(GLIFO_AS_OF)}; genérico 54%–Power Plus II). UAN sin cotización nombrada.`,
  ];

  return {
    ok: true,
    asOf,
    fetchedAt,
    fertilizantes,
    combustibles: { gasoil: gas.point },
    sources: [
      {
        id: "se-surtidor",
        label: "SE Precios en Surtidor Res.314/2016",
        ok: gas.ok,
      },
      {
        id: "if-rif",
        label: "IF vía Bichos de Campo (curated)",
        ok: true,
      },
      {
        id: "campo-simple-glifo",
        label: "Campo Simple lista web glifosato",
        ok: true,
      },
    ],
    slots,
    note: noteParts.join(" "),
  };
}
