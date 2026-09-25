import fallback from "@/data/catac-fallback.json";
import type { CatacSnapshot, CatacTarifa } from "@/lib/types";

const WP_MEDIA =
  "https://api.apicatac.com/wp-json/wp/v2/media?search=TARIFA%20REFERENCIA&per_page=5&orderby=date&order=desc";
const PDF_ABRIL =
  "https://api.apicatac.com/wp-content/uploads/2026/04/TARIFA-REFERENCIA-CATAC-ABRIL-26.pdf";

type FallbackShape = {
  mes: string;
  mesLabel: string;
  mesShort: string;
  pdfUrl: string;
  mediaId: number;
  tarifas: CatacTarifa[];
};

function nowIso() {
  return new Date().toISOString();
}

function lookupArs(tarifas: CatacTarifa[], km: number | null): number | null {
  if (km == null || !Number.isFinite(km) || tarifas.length === 0) return null;
  const k = Math.max(1, Math.min(999, Math.round(km)));
  const hit = tarifas.find((t) => t.km === k);
  return hit ? hit.arsPerTon : null;
}

function fromFallback(
  km: number | null,
  note: string,
): CatacSnapshot {
  const f = fallback as FallbackShape;
  // CATAC publica cuadros sin periodicidad fija: el último cuadro publicado sigue
  // vigente hasta que salga uno nuevo → NO se marca viejo por calendario.
  const vigenteDesde = `${f.mes.slice(0, 4)}-${f.mes.slice(4, 6)}-${f.mes.slice(6, 8)}`;
  const dm = `${f.mes.slice(6, 8)}/${f.mes.slice(4, 6)}`;
  return {
    ok: f.tarifas.length > 0,
    mes: f.mes,
    mesLabel: f.mesLabel,
    mesShort: f.mesShort,
    staleVsCalendar: false,
    statusLabel: `Tarifa CATAC vigente desde ${dm} (último cuadro publicado)`,
    vigenteDesde,
    pdfUrl: f.pdfUrl || PDF_ABRIL,
    mediaId: f.mediaId,
    tarifas: f.tarifas,
    arsPerTon: lookupArs(f.tarifas, km),
    km,
    parseOk: true,
    parseNote: note,
    fetchedAt: nowIso(),
    fuente: "fallback",
  };
}

function emptySnapshot(km: number | null, note: string): CatacSnapshot {
  return {
    ok: false,
    mes: null,
    mesLabel: null,
    mesShort: null,
    staleVsCalendar: true,
    statusLabel: "sin dato CATAC",
    pdfUrl: PDF_ABRIL,
    mediaId: null,
    tarifas: [],
    arsPerTon: null,
    km,
    parseOk: false,
    parseNote: note,
    fetchedAt: nowIso(),
    fuente: "none",
  };
}

/**
 * Intenta WordPress media de apicatac; si el bot-wall o la red fallan,
 * usa fallback embebido abr-26 (último valor guardado). Nunca inventa precios.
 */
export async function getCatac(km: number | null = null): Promise<CatacSnapshot> {
  try {
    const res = await fetch(WP_MEDIA, {
      headers: {
        Accept: "application/json",
        "User-Agent": "digest-diario/0.1 (DHF Advisory; +https://github.com/Diegof10/alerta-sisa)",
      },
      next: { revalidate: 3600 },
    });
    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("application/json")) {
      return fromFallback(
        km,
        `Fetch live CATAC no disponible (HTTP ${res.status}, ${ctype || "sin content-type"}). Usando fallback embebido abr-26.`,
      );
    }
    const media = (await res.json()) as Array<{
      id: number;
      source_url?: string;
      date?: string;
      title?: { rendered?: string };
    }>;
    if (!Array.isArray(media) || media.length === 0) {
      return fromFallback(km, "WP media vacío. Fallback embebido abr-26.");
    }
    const first = media[0];
    // Sin parser PDF en este scaffold: devolvemos metadatos live + tarifas del fallback
    // etiquetadas como último valor guardado (no inventamos una tabla nueva).
    const base = fromFallback(
      km,
      `Media live id=${first.id}. Tabla km→ARS/t del PDF no parseada aquí; tarifas = último valor guardado abr-26.`,
    );
    return {
      ...base,
      pdfUrl: first.source_url || base.pdfUrl,
      mediaId: first.id,
      fuente: "live",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fb = fallback as FallbackShape;
    if (fb.tarifas?.length) {
      return fromFallback(km, `Error fetch CATAC: ${msg}. Fallback embebido abr-26.`);
    }
    return emptySnapshot(km, `Error fetch CATAC: ${msg}. Sin fallback.`);
  }
}

export function arsPerTonForKm(tarifas: CatacTarifa[], km: number): number | null {
  return lookupArs(tarifas, km);
}
