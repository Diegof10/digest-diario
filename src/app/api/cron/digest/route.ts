import { NextRequest, NextResponse } from "next/server";
import { resumenClimaVivo } from "@/lib/clima-vivo";
import { DEFAULT_KM } from "@/lib/digest";
import { captureHome } from "@/lib/home-data";
import { appendCronLog } from "@/lib/serie-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron (ver vercel.json): 07:00 ART diario + 11:15 y 18:30 ART lun–vie.
 * Arma el resumen fresco y lo guarda en Blob (`digest/latest.json`) para que
 * la home no consulte las fuentes. La serie de pizarras se escribe sólo si
 * hay un precio nuevo: a las 07:00 ART suele no haber pizarra nueva y eso
 * no es un fallo (`seriesReason: "unchanged"`).
 * Protegido con CRON_SECRET: Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      console.warn("[cron/digest] unauthorized");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;

  const started = Date.now();
  const { data, blob } = await captureHome(km);
  const p = data.digest.mercado.plazas;
  const resumen = p
    ? Object.fromEntries(
        (["cac", "afa"] as const).map((k) => [
          k,
          { fecha: p[k].fecha, frescura: p[k].frescura, granos: p[k].granos.length, error: p[k].error },
        ]),
      )
    : null;
  const ms = Date.now() - started;
  const seriesReason = p?.persistencia.reason ?? (p ? null : "sin plazas");
  const granosOk = (data.digest.mercado.sourcesOk ?? []).includes("feed granos");
  const clima = resumenClimaVivo(data.climaVivo);
  const climaVivoOk = clima.estado === "ok";
  const climaVivoError = climaVivoOk ? null : (clima.errorLectura ?? clima.errores[0] ?? "sin dato");
  // `ok` sigue siendo "el resumen se guardó". Un fallo de clima ahora no tira el digest:
  // queda en climaVivoOk / el log, y la home reconsulta Open-Meteo.
  const ok = blob.written;
  await appendCronLog({
    at: new Date().toISOString(),
    ms,
    userAgent: req.headers.get("user-agent"),
    plazas: resumen,
    blobWritten: blob.written,
    ok,
    seriesWritten: Boolean(p?.persistencia.written),
    seriesReason,
    granosOk,
    climaVivoOk,
    climaVivoError,
  }).catch(() => {});
  if (!climaVivoOk) {
    console.error(`[cron/digest] clima-vivo FAIL ${climaVivoError}`);
  }
  console.log(
    `[cron/digest] ${ok ? "ok" : "FAIL"} ${ms}ms blob=${blob.written} series=${seriesReason} granos=${granosOk} climaVivo=${climaVivoOk ? "ok" : climaVivoError} plazas=${JSON.stringify(resumen)}`,
  );
  return NextResponse.json(
    {
      ok,
      cron: true,
      ranAt: new Date().toISOString(),
      ms,
      blobWritten: blob.written,
      blobError: blob.error,
      seriesWritten: Boolean(p?.persistencia.written),
      seriesReason,
      granosOk,
      climaVivoOk,
      climaVivoError,
      climaVivo: clima,
      plazas: resumen,
      persistencia: p?.persistencia ?? null,
    },
    { status: ok ? 200 : 500 },
  );
}
