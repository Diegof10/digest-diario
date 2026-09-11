/** Parser + fetch del padrón SISA (RG4310). Scoring 0=inactivo, 1–3=estados. Sin % retención. */

export const SISA_ZIP_URL =
  "https://serviciosweb.afip.gob.ar/genericos/Registros/op_granos/Archivos/RG_4310.zip";

export const SISA_FUENTE = "RG4310.ZIP · ARCA/AFIP padrón SISA";

export type SisaRecord = {
  cuit: string;
  razonSocial: string;
  /** Scoring 0–3; 0 = inactivo */
  scoring: string;
  fechaVigenciaEstado: string;
  categoria: string;
  /** AL / BA */
  situacionCategoria: string;
  fechaVigenciaCategoria: string;
};

export type SisaPadronResult =
  | {
      ok: true;
      fechaActualizacion: string;
      byCuit: Map<string, SisaRecord>;
      rowCount: number;
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      fetchedAt: string;
    };

export function normalizeCuit(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function scoringLabel(scoring: string): string {
  const s = scoring.trim();
  if (s === "0") return "0 (inactivo)";
  if (s === "1" || s === "2" || s === "3") return s;
  return s || "—";
}

/** Parse RG_4310.txt (latin-1). First line = fecha actualización; second = header. */
export function parseRg4310Text(text: string): {
  fechaActualizacion: string;
  records: SisaRecord[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 3) {
    throw new Error("Padrón vacío o ilegible");
  }
  const fechaActualizacion = lines[0].includes(":")
    ? lines[0].split(":").slice(1).join(":").trim()
    : lines[0].trim();
  const records: SisaRecord[] = [];
  for (let i = 2; i < lines.length; i++) {
    const p = lines[i].split(";");
    if (p.length < 11) continue;
    const cuit = normalizeCuit(p[0]);
    if (cuit.length < 11) continue;
    records.push({
      cuit,
      razonSocial: (p[1] || "").trim(),
      scoring: (p[2] || "").trim(),
      fechaVigenciaEstado: (p[3] || "").trim(),
      categoria: (p[9] || "").trim(),
      situacionCategoria: (p[10] || "").trim(),
      fechaVigenciaCategoria: (p[11] || "").trim(),
    });
  }
  return { fechaActualizacion, records };
}

export async function fetchSisaPadron(): Promise<SisaPadronResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(SISA_ZIP_URL, {
      headers: { "User-Agent": "DHF-AlertaSISA/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `padrón no disponible (HTTP ${res.status})`,
        fetchedAt,
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buf);
    const entry =
      zip.getEntries().find((e) => /RG_?4310\.txt$/i.test(e.entryName)) ||
      zip.getEntries()[0];
    if (!entry) {
      return { ok: false, error: "padrón no disponible (ZIP sin TXT)", fetchedAt };
    }
    const text = entry.getData().toString("latin1");
    const { fechaActualizacion, records } = parseRg4310Text(text);
    const byCuit = new Map<string, SisaRecord>();
    for (const r of records) byCuit.set(r.cuit, r);
    return {
      ok: true,
      fechaActualizacion,
      byCuit,
      rowCount: records.length,
      fetchedAt,
    };
  } catch (e) {
    return {
      ok: false,
      error: `padrón no disponible (${e instanceof Error ? e.message : String(e)})`,
      fetchedAt,
    };
  }
}
