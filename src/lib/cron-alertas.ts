import { readClimaBlob } from "@/lib/clima-cron";
import { readFiscalBlob } from "@/lib/fiscal-cron";
import { isoToDmy } from "@/lib/habiles";
import { readNoticiasRun } from "@/lib/noticias-cron";
import { readCronLog, type CronRun } from "@/lib/serie-blob";

export interface AlertaCron {
  cron: "digest" | "fiscal" | "clima" | "noticias";
  /** true = la última corrida falló o no guardó. Solo lo expone /api/health. */
  severo: boolean;
  at: string | null;
  mensaje: string;
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "s/f";
  const dia = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? isoToDmy(dia) : iso;
}

function alertaDigest(run: CronRun | undefined): AlertaCron | null {
  if (!run) return null;
  const cuando = fechaCorta(run.at);
  if (run.ok === false || run.blobWritten === false) {
    const por = run.blobWritten === false ? "no guardó el resumen (blobWritten: false)" : "devolvió ok: false";
    return {
      cron: "digest",
      severo: true,
      at: run.at,
      mensaje: `Cron digest del ${cuando} ${por}.`,
    };
  }
  if (run.seriesReason === "error" || run.seriesReason === "empty") {
    return {
      cron: "digest",
      severo: true,
      at: run.at,
      mensaje: `Cron digest del ${cuando} no pudo guardar la serie de precios (${run.seriesReason}).`,
    };
  }
  if (run.seriesReason === "unchanged") {
    return {
      cron: "digest",
      severo: false,
      at: run.at,
      mensaje: `Cron digest del ${cuando}: el resumen se guardó y la serie de precios no tenía valores nuevos.`,
    };
  }
  return null;
}

export async function leerAlertas(): Promise<AlertaCron[]> {
  const [runs, fiscal, clima, noticias] = await Promise.all([
    readCronLog().catch(() => [] as CronRun[]),
    readFiscalBlob().catch(() => null),
    readClimaBlob().catch(() => null),
    readNoticiasRun().catch(() => null),
  ]);
  const out: AlertaCron[] = [];
  const dig = alertaDigest(runs[0]);
  if (dig) out.push(dig);

  const f = fiscal?.ultimaCorrida;
  if (f && f.ok === false) {
    const dato = fiscal?.revisadoAt ? isoToDmy(fiscal.revisadoAt.slice(0, 10)) : "—";
    out.push({
      cron: "fiscal",
      severo: true,
      at: f.at,
      mensaje: `Cron fiscal del ${fechaCorta(f.at)} devolvió ok: false. En pantalla: dato al ${dato}.`,
    });
  }

  const c = clima?.ultimaCorrida;
  if (c && c.ok === false) {
    out.push({
      cron: "clima",
      severo: true,
      at: c.at,
      mensaje: `Cron clima del ${fechaCorta(c.at)} devolvió ok: false.`,
    });
  }

  if (noticias && noticias.ok === false) {
    out.push({
      cron: "noticias",
      severo: true,
      at: noticias.at,
      mensaje: `Cron noticias del ${fechaCorta(noticias.at)} devolvió ok: false.`,
    });
  }
  return out;
}
