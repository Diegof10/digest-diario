import { NextResponse } from "next/server";
import { getMatba } from "@/lib/matba";

/**
 * GET /api/granos — feed de granos de Resumen agrario.
 *
 * Toma el feed base (CBOT, CAC, AFA, FAS, BNA, USDA) de lark-lake y REEMPLAZA el
 * bloque `matba` por los ajustes oficiales de A3 Matba Rofex (src/lib/matba.ts):
 * cada contrato con symbol, contract, value (US$/t), asOf (fecha de la rueda),
 * frescura y stale. El bloque matba del feed externo se descarta: devolvía
 * valores clavados (soja May-27 332,5) con la fecha del día.
 *
 * ?fresh=1 → sin caché.
 */
export const dynamic = "force-dynamic";

const BASE_URL = "https://lark-lake-solar-craft.grok.me/api/granos";
const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.1; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Source = { id: string; label: string; ok: boolean };

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const matbaPromise = getMatba({ fresh });

  let base: Record<string, unknown> = {};
  let baseOk = false;
  let baseError: string | null = null;
  try {
    const res = await fetch(BASE_URL, {
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      base = (await res.json()) as Record<string, unknown>;
      baseOk = true;
    } else {
      baseError = `HTTP ${res.status}`;
    }
  } catch (err) {
    baseError = err instanceof Error ? err.message : String(err);
  }

  const m = await matbaPromise;
  const sources = ((base.sources as Source[] | undefined) ?? []).filter((s) => s.id !== "mae");
  if (!baseOk) sources.unshift({ id: "base", label: `Feed base lark-lake (${baseError})`, ok: false });
  sources.push({ id: "matba", label: m.fuente, ok: m.ok });

  const body = {
    ...base,
    asOf: (base.asOf as string | undefined) ?? new Date().toISOString(),
    sources,
    matba: m.contratos,
    matbaAsOf: m.asOf,
    matbaStatus: {
      ok: m.ok,
      asOf: m.asOf,
      esperado: m.esperado,
      frescura: m.frescura,
      stale: m.stale,
      origen: m.origen,
      error: m.error,
      fuente: m.fuente,
      fuenteUrl: m.fuenteUrl,
      nota:
        "Precios de AJUSTE de futuros Matba (US$/t) de la rueda asOf. No son disponible. stale=true → no es el último ajuste esperado.",
      fetchedAt: m.fetchedAt,
    },
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}
