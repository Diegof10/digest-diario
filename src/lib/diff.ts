import type { SisaRecord } from "./sisa";
import { scoringLabel } from "./sisa";

export type StoredState = {
  cuit: string;
  razonSocial?: string;
  scoring: string;
  fechaVigenciaEstado: string;
  categoria: string;
  situacionCategoria: string;
  fechaVigenciaCategoria?: string;
  fetchedAt: string;
};

export type SisaChange = {
  cuit: string;
  razonSocial: string;
  oldScoring: string;
  newScoring: string;
  oldSituacion: string;
  newSituacion: string;
  oldCategoria: string;
  newCategoria: string;
  fechaVigencia: string;
  changedScoring: boolean;
  changedCategoria: boolean;
};

export function detectChange(
  prev: StoredState | undefined,
  next: SisaRecord
): SisaChange | null {
  if (!prev) return null;
  const changedScoring = prev.scoring.trim() !== next.scoring.trim();
  const changedSituacion =
    prev.situacionCategoria.trim() !== next.situacionCategoria.trim();
  const changedCatName = prev.categoria.trim() !== next.categoria.trim();
  const changedCategoria = changedSituacion || changedCatName;
  if (!changedScoring && !changedCategoria) return null;
  return {
    cuit: next.cuit,
    razonSocial: next.razonSocial,
    oldScoring: prev.scoring,
    newScoring: next.scoring,
    oldSituacion: prev.situacionCategoria,
    newSituacion: next.situacionCategoria,
    oldCategoria: prev.categoria,
    newCategoria: next.categoria,
    fechaVigencia: next.fechaVigenciaEstado || next.fechaVigenciaCategoria || "—",
    changedScoring,
    changedCategoria,
  };
}

/** 6 líneas Informe: listo para mail / WhatsApp v2. */
export function buildAlertLines(
  change: SisaChange,
  fuente: string
): string {
  const estadoViejo = `${scoringLabel(change.oldScoring)} / ${change.oldSituacion || "—"} (${change.oldCategoria || "—"})`;
  const estadoNuevo = `${scoringLabel(change.newScoring)} / ${change.newSituacion || "—"} (${change.newCategoria || "—"})`;
  return [
    `CUIT ${change.cuit}${change.razonSocial ? ` — ${change.razonSocial}` : ""}`,
    `estado: ${estadoViejo} → ${estadoNuevo}`,
    `fecha vigencia: ${change.fechaVigencia}`,
    `fuente: ${fuente}`,
    `chequear ARCA`,
    `No es dictamen. Análisis de gestión DHF Advisory. Sujeto a revisión de Diego.`,
  ].join("\n");
}

export function toStored(rec: SisaRecord, fetchedAt: string): StoredState {
  return {
    cuit: rec.cuit,
    razonSocial: rec.razonSocial,
    scoring: rec.scoring,
    fechaVigenciaEstado: rec.fechaVigenciaEstado,
    categoria: rec.categoria,
    situacionCategoria: rec.situacionCategoria,
    fechaVigenciaCategoria: rec.fechaVigenciaCategoria,
    fetchedAt,
  };
}
