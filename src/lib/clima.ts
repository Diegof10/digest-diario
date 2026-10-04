import type { ClimaEntry, ClimaSnapshot, EtiquetaDato } from "@/lib/types";
import { hoyArtIso } from "@/lib/habiles";
import { readClimaBlob, type ClimaBlobFile } from "@/lib/clima-cron";

/**
 * Boletines oficiales curados a mano (SMN trimestral, INMET mensual, USDM/CPC).
 * Al actualizar un bullet, actualizar también CURADO_ISO / INMET_CURADO.
 * Lo diario (pronóstico 7 días, USDM semanal) lo trae el cron /api/cron/clima.
 */
const CLIMA_HECHO: Omit<ClimaEntry, "etiqueta">[] = [
  {
    country: "AR",
    countryLabel: "Argentina",
    bullet:
      "Trimestre oct–dic: lluvias superiores a lo normal en Litoral, Córdoba, oeste Santa Fe, Cuyo centro-sur, La Pampa, oeste BA y NE Patagonia; temps inferiores en Cuyo/Córdoba/oeste Santa Fe/La Pampa/oeste BA (SMN 30/9).",
    fuente: "SMN Pronóstico Climático Trimestral oct–dic 2026",
    fecha: "30/9/2026",
    url: "https://www.smn.gob.ar/pronostico-trimestral",
    secondaryUrl:
      "https://www.clarin.com/sociedad/dan-pronostico-clima-fin-ano-super-nino-suma-raro-desvio-termico-exceso-lluvias_0_lA4hofaODb.html",
    secondaryNote: "Cobertura Clarín del boletín SMN OND (elaborado 30/9)",
  },
  {
    country: "BR",
    countryLabel: "Brasil",
    bullet:
      "Set–nov señal mixta; Norte/Nordeste más seco y caliente, Sul/Sudeste más lluvia (INMET 10/9).",
    fuente: "INMET Boletim Agroclimatológico set/2026",
    fecha: "10/9/2026",
    url: "https://portal.inmet.gov.br/noticias/boletim-agroclimatol%C3%B3gico-mensal-setembro-2026",
    secondaryUrl:
      "https://portal.inmet.gov.br/uploads/boletinsAgroclimatologicos/Boletim_AGRO_Setembro_2026.pdf",
    secondaryNote: "PDF + Agritempo monitoring",
  },
  {
    country: "US",
    countryLabel: "Estados Unidos",
    bullet:
      "Mapa USDM 29/9 (publicado 1/10): sequía intensa Sur/Planicies (TX–OK–AR) con lluvias que alivian Suroeste/High Plains; Medio Oeste mixto. CPC SDO a dic (30/9): mejora sur/centro, desarrollo Norte Rocosas–Noroeste.",
    fuente: "US Drought Monitor · NOAA CPC Seasonal Drought Outlook",
    fecha: "29/9–1/10/2026",
    url: "https://droughtmonitor.unl.edu/",
    secondaryUrl:
      "https://www.cpc.ncep.noaa.gov/products/expert_assessment/sdo_summary.php/",
    secondaryNote: "CPC Seasonal Drought Outlook (30/9; próximo 15/10)",
  },
];

const CURADO_ISO: Record<ClimaEntry["country"], string> = {
  AR: "2026-09-30",
  BR: "2026-09-10",
  US: "2026-10-01",
};
/** Mes (portugués) del boletín INMET curado arriba */
const INMET_CURADO = "setembro/2026";

const OPEN_METEO_URL = "https://open-meteo.com/";
const USDM_URL = "https://droughtmonitor.unl.edu/";
/** Más de esto sin corrida OK del cron → "último valor guardado". */
const HORAS_VIGENTE = 30;

function hhmm(iso: string): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Cordoba",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")} ${g("hour").replace(/^24$/, "00")}:${g("minute")}`;
}

function diasEntre(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T12:00:00Z`) - Date.parse(`${aIso}T12:00:00Z`)) / 86400_000);
}

async function cargarBlob(): Promise<ClimaBlobFile | null> {
  try {
    return await readClimaBlob();
  } catch {
    return null;
  }
}

/**
 * Clima AR/BR/US = texto curado de los boletines oficiales (CLIMA_HECHO, a mano)
 * + capa automática del cron /api/cron/clima (Blob `clima/latest.json`):
 * pronóstico 7 días por zona (Open-Meteo), USDM semanal y aviso de boletín INMET nuevo.
 * La etiqueta refleja la última corrida OK del cron, no un "ping" a las fuentes.
 * `opts.blob` (pruebas): usar ese archivo en vez de leer Blob.
 */
export async function getClima(opts: { blob?: ClimaBlobFile | null; now?: Date } = {}): Promise<ClimaSnapshot> {
  const now = opts.now ?? new Date();
  const blob = opts.blob !== undefined ? opts.blob : await cargarBlob();
  const hoy = hoyArtIso(now);
  const actualizadoAt = blob?.actualizadoAt ?? null;
  const horas = actualizadoAt ? Math.max(0, (now.getTime() - Date.parse(actualizadoAt)) / 3600_000) : null;
  const vigente = horas != null && horas <= HORAS_VIGENTE;
  const etiqueta: EtiquetaDato = vigente ? "HECHO" : "ÚLTIMO_GUARDADO";

  const entries: ClimaEntry[] = CLIMA_HECHO.map((e) => {
    const pr = blob?.pronostico?.[e.country];
    const out: ClimaEntry = {
      ...e,
      etiqueta,
      pronostico: pr ? { texto: pr.texto, fuente: "Open-Meteo (modelo)", url: OPEN_METEO_URL, at: pr.at } : null,
      dato: null,
      aviso: null,
    };
    if (e.country === "US" && blob?.usdm) {
      out.dato = { texto: blob.usdm.texto, fuente: "US Drought Monitor", url: USDM_URL, fecha: blob.usdm.mapDate };
    }
    if (e.country === "BR" && blob?.inmet?.publicado && blob.inmet.mes !== INMET_CURADO) {
      out.aviso = { texto: `INMET publicó el boletim agroclimatológico de ${blob.inmet.mes}; el resumen de arriba es de ${INMET_CURADO}.`, url: blob.inmet.url };
    }
    if (e.country === "AR" && diasEntre(CURADO_ISO.AR, hoy) > 35) {
      out.aviso = { texto: "El trimestral SMN de arriba tiene más de un mes; probablemente ya hay uno nuevo.", url: e.url };
    }
    return out;
  });

  const corrida = blob?.ultimaCorrida ?? null;
  const note = actualizadoAt
    ? vigente
      ? `Pronóstico 7 días y USDM automáticos (act. ${hhmm(actualizadoAt)} ART) · boletines SMN 30/9 · INMET 10/9 · CPC 30/9 curados.`
      : `último valor guardado — sin actualización automática desde ${hhmm(actualizadoAt)} ART; boletines curados SMN 30/9 · INMET 10/9 · CPC 30/9.`
    : "último valor guardado — la actualización automática todavía no corrió; boletines curados SMN 30/9 · INMET 10/9 · USDM 29/9–1/10 · CPC 30/9.";

  return {
    ok: true,
    entries,
    note,
    fetchedAt: now.toISOString(),
    fuente: vigente ? "live" : "snapshot",
    etiqueta,
    actualizadoAt,
    horasSinActualizar: horas == null ? null : Math.round(horas * 10) / 10,
    cronAt: corrida?.at ?? null,
    cronOk: corrida ? corrida.ok : null,
    cronErrores: corrida?.errores ?? [],
  };
}

/** Short one-line summary for MercadoRow.valor */
export function climaResumen(clima: ClimaSnapshot): string {
  return clima.entries
    .map((e) => {
      const pr = e.pronostico?.texto.match(/lluvia prom\. ([\d.,]+) mm.*?máx\. prom\. ([\d.,-]+) °C/);
      return pr
        ? `${e.country}: lluvia 7 días ${pr[1]} mm, máx. ${pr[2]} °C${/helada/i.test(e.pronostico!.texto) ? ", riesgo de helada" : ""}`
        : `${e.country}: ${e.bullet.replace(/\.$/, "")}`;
    })
    .join(" · ");
}

export function climaFuenteLabel(clima: ClimaSnapshot): string {
  if (clima.etiqueta === "ÚLTIMO_GUARDADO") {
    return "último valor guardado · SMN/INMET/USDM";
  }
  return "Open-Meteo (modelo) · USDM · SMN/INMET/CPC";
}

export function climaFechaLabel(clima: ClimaSnapshot): string {
  const base = clima.entries.map((e) => `${e.country} ${e.fecha}`).join(" · ");
  return clima.actualizadoAt ? `pronóstico ${hhmm(clima.actualizadoAt)} · ${base}` : base;
}
