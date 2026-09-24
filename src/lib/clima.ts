import type { ClimaEntry, ClimaSnapshot, EtiquetaDato } from "@/lib/types";

/**
 * Snapshot HECHO aprobado por Mercado Granos + Lead.
 * Paint as text + link + date — NO fake heatmap.
 * Live fetch is optional; on failure return this with "último valor guardado".
 */
const CLIMA_HECHO: Omit<ClimaEntry, "etiqueta">[] = [
  {
    country: "AR",
    countryLabel: "Argentina",
    bullet:
      "Tendencia primavera más húmeda en zona núcleo (SMN trimestral).",
    fuente: "SMN Pronóstico Climático Trimestral",
    fecha: "ago-2026",
    url: "https://ws2.smn.gob.ar/pronostico-trimestral",
    secondaryUrl: null,
    secondaryNote: null,
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
      "Sequía amplia al 15/9; outlook CPC a dic favorece mejora Este/Sur y persistencia Norte/Montañas (17/9).",
    fuente: "US Drought Monitor · NOAA CPC Seasonal Drought Outlook",
    fecha: "15–17/9/2026",
    url: "https://droughtmonitor.unl.edu/",
    secondaryUrl:
      "https://www.cpc.ncep.noaa.gov/products/expert_assessment/sdo_summary.php/",
    secondaryNote: "CPC Seasonal Drought Outlook (17/9)",
  },
];

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.1; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function probeReachable(url: string, ms = 3500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
    });
    // Some hosts reject HEAD; treat any network response as reachable
    return res.status > 0;
  } catch {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/pdf,*/*",
        },
        signal: ctrl.signal,
        cache: "no-store",
        redirect: "follow",
      });
      return res.status > 0 && res.status < 500;
    } catch {
      return false;
    }
  } finally {
    clearTimeout(t);
  }
}

function withEtiqueta(
  entries: Omit<ClimaEntry, "etiqueta">[],
  etiqueta: EtiquetaDato,
): ClimaEntry[] {
  return entries.map((e) => ({ ...e, etiqueta }));
}

function snapshotFromHecho(
  etiqueta: EtiquetaDato,
  liveOk: boolean,
  note: string,
): ClimaSnapshot {
  const entries = withEtiqueta(CLIMA_HECHO, etiqueta);
  return {
    ok: true,
    entries,
    note,
    fetchedAt: new Date().toISOString(),
    fuente: liveOk ? "live" : "snapshot",
    etiqueta,
  };
}

/**
 * Returns dated clima snapshot AR/BR/US.
 * Optional live probe of primary URLs; on any failure uses approved HECHO
 * content labeled "último valor guardado" — never invents different weather.
 */
export async function getClima(): Promise<ClimaSnapshot> {
  try {
    const probes = await Promise.all(
      CLIMA_HECHO.map((e) => probeReachable(e.url)),
    );
    const allOk = probes.every(Boolean);
    if (allOk) {
      return snapshotFromHecho(
        "HECHO",
        true,
        "Fuentes climáticos alcanzables · snapshot HECHO aprobado (SMN / INMET 10/9 / USDM+CPC).",
      );
    }
    return snapshotFromHecho(
      "ÚLTIMO_GUARDADO",
      false,
      "último valor guardado — probe parcial/fallido; bullets HECHO aprobados (SMN ago-2026 · INMET 10/9 · USDM 15/9 · CPC 17/9).",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return snapshotFromHecho(
      "ÚLTIMO_GUARDADO",
      false,
      `último valor guardado — ${msg}`,
    );
  }
}

/** Short one-line summary for MercadoRow.valor */
export function climaResumen(clima: ClimaSnapshot): string {
  return clima.entries
    .map((e) => `${e.country}: ${e.bullet.replace(/\.$/, "")}`)
    .join(" · ");
}

export function climaFuenteLabel(clima: ClimaSnapshot): string {
  if (clima.etiqueta === "ÚLTIMO_GUARDADO") {
    return "último valor guardado · SMN/INMET/USDM";
  }
  return "SMN · INMET · USDM/CPC";
}

export function climaFechaLabel(clima: ClimaSnapshot): string {
  return clima.entries.map((e) => `${e.country} ${e.fecha}`).join(" · ");
}
