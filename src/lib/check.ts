import {
  buildAlertLines,
  detectChange,
  toStored,
  type SisaChange,
  type StoredState,
} from "./diff";
import { sendSisaAlert } from "./mail";
import { fetchSisaPadron, normalizeCuit, SISA_FUENTE } from "./sisa";
import { loadLastState, loadWatchlist, saveLastState } from "./store";

export type CheckReport = {
  ok: boolean;
  padrón: "ok" | "no disponible";
  fechaActualizacion?: string;
  watched: number;
  found: number;
  missing: string[];
  changes: Array<{ cuit: string; lines: string; mailed: boolean }>;
  error?: string;
  dryRun: boolean;
};

export async function runSisaCheck(opts?: {
  dryRun?: boolean;
}): Promise<CheckReport> {
  const dryRun = opts?.dryRun === true || process.env.DRY_RUN === "1";
  const watch = await loadWatchlist();
  const prev = await loadLastState();
  const padrón = await fetchSisaPadron();

  if (!padrón.ok) {
    return {
      ok: false,
      padrón: "no disponible",
      watched: watch.length,
      found: 0,
      missing: watch.map((w) => normalizeCuit(w.cuit)),
      changes: [],
      error: padrón.error,
      dryRun,
    };
  }

  const nextState: Record<string, StoredState> = { ...prev };
  const changes: CheckReport["changes"] = [];
  const missing: string[] = [];
  let found = 0;
  const defaultTo = process.env.MAIL_TO || "";

  for (const item of watch) {
    const cuit = normalizeCuit(item.cuit);
    const rec = padrón.byCuit.get(cuit);
    if (!rec) {
      missing.push(cuit);
      continue;
    }
    found++;
    const change: SisaChange | null = detectChange(prev[cuit], rec);
    nextState[cuit] = toStored(rec, padrón.fetchedAt);
    if (change) {
      const lines = buildAlertLines(change, SISA_FUENTE);
      let mailed = false;
      if (!dryRun) {
        const to = item.mailTo || defaultTo;
        if (to) {
          const r = await sendSisaAlert({ to, change });
          mailed = r.sent || r.mode === "log";
        }
      }
      changes.push({ cuit, lines, mailed });
    }
  }

  if (!dryRun) {
    await saveLastState(nextState);
  }

  return {
    ok: true,
    padrón: "ok",
    fechaActualizacion: padrón.fechaActualizacion,
    watched: watch.length,
    found,
    missing,
    changes,
    dryRun,
  };
}
