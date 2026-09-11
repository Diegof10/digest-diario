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
  baseline: number;
  missing: Array<{ cuit: string; note: string }>;
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
      baseline: 0,
      missing: watch.map((w) => ({
        cuit: normalizeCuit(w.cuit),
        note: "padrón no disponible",
      })),
      changes: [],
      error: padrón.error,
      dryRun,
    };
  }

  const nextState: Record<string, StoredState> = { ...prev };
  const changes: CheckReport["changes"] = [];
  const missing: CheckReport["missing"] = [];
  let found = 0;
  let baseline = 0;
  const defaultTo = process.env.MAIL_TO || "";

  for (const item of watch) {
    const cuit = normalizeCuit(item.cuit);
    const rec = padrón.byCuit.get(cuit);
    if (!rec) {
      missing.push({ cuit, note: "no figura en padrón" });
      continue;
    }
    found++;

    // Prefer watchlist nombre in alerts
    const recForAlert = {
      ...rec,
      razonSocial: item.label || rec.razonSocial,
    };

    const hadPrev = Boolean(prev[cuit]);
    if (!hadPrev) {
      // Primera corrida: arma baseline, no manda mail
      nextState[cuit] = toStored(recForAlert, padrón.fetchedAt);
      baseline++;
      continue;
    }

    const change: SisaChange | null = detectChange(prev[cuit], recForAlert);
    nextState[cuit] = toStored(recForAlert, padrón.fetchedAt);
    if (change) {
      // keep label from watchlist in message
      if (item.label) change.razonSocial = item.label;
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
    baseline,
    missing,
    changes,
    dryRun,
  };
}
