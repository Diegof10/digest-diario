import { NextResponse } from "next/server";
import { getFobFas, type FobFasSnapshot } from "@/lib/fob-fas";
import { dmyToIso, marcaAntiguedad, UMBRAL_FAS_DIAS } from "@/lib/habiles";
import { getMatba } from "@/lib/matba";
import { getPlazas, type PlazasSnapshot } from "@/lib/plazas";

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
type LocalPlaza = { plaza?: string; sorgo?: number | null; unit?: string; hint?: string; [k: string]: unknown };

const LABEL: Record<string, string> = {
  soja: "Soja",
  maiz: "Maíz",
  trigo: "Trigo",
  girasol: "Girasol",
  sorgo: "Sorgo",
};

function sumarSorgo(local: unknown, plazas: PlazasSnapshot | null): unknown {
  if (!plazas) return local;
  const rows: LocalPlaza[] = Array.isArray(local) ? [...(local as LocalPlaza[])] : [];
  const poner = (nombre: string, usd: number | null | undefined, fecha: string | null) => {
    if (usd == null) return;
    const hit = rows.find((x) => (x.plaza ?? "").toLowerCase().includes(nombre.toLowerCase()));
    if (hit) {
      hit.sorgo = usd;
      return;
    }
    rows.push({ plaza: nombre, sorgo: usd, unit: "usdt", hint: fecha ?? undefined });
  };
  const de = (id: "cac" | "afa", nombre: string) => {
    const g = plazas[id].granos.find((x) => x.grano === "sorgo");
    poner(nombre, g?.usd ?? null, g?.fecha ?? null);
  };
  de("cac", "Rosario");
  de("afa", "AFA");
  return rows;
}

function fasOficial(fob: FobFasSnapshot) {
  if (!fob.fecha || fob.items.length === 0) return null;
  const [y, m, d] = fob.fecha.split("-");
  const asOf = `${d}/${m}/${y}`;
  return fob.items.map((it) => ({
    grain: it.grano,
    label: LABEL[it.grano] ?? it.grano,
    fob: it.fobUsd,
    fasArs: it.fasArs,
    asOf,
    asOfIso: fob.fecha,
    antiguedad: fob.antiguedad,
    ok: fob.antiguedad === "ok",
  }));
}

function marcarFasFeed(fas: unknown) {
  if (!Array.isArray(fas)) return fas;
  return fas.map((item) => {
    const row = item as { asOf?: string };
    const iso = dmyToIso(row.asOf);
    const antiguedad = marcaAntiguedad(iso, UMBRAL_FAS_DIAS);
    return { ...row, asOfIso: iso, antiguedad, ok: antiguedad === "ok" };
  });
}

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const matbaPromise = getMatba({ fresh });
  const fobPromise = getFobFas();
  const plazasPromise = getPlazas({ fresh, persist: false }).catch(() => null);

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

  const [m, fob, plazas] = await Promise.all([matbaPromise, fobPromise, plazasPromise]);
  const sources = ((base.sources as Source[] | undefined) ?? []).filter((s) => s.id !== "mae");
  if (!baseOk) sources.unshift({ id: "base", label: `Feed base lark-lake (${baseError})`, ok: false });
  sources.push({ id: "matba", label: m.fuente, ok: m.ok });

  const fasNuevo = fasOficial(fob);
  const fas = fasNuevo ?? marcarFasFeed(base.fas);
  const fasOk = Array.isArray(fas) && fas.length > 0 && fas.every((x) => (x as { ok?: boolean }).ok !== false);
  const magyp = sources.find((s) => s.id === "magyp");
  if (magyp) {
    magyp.ok = Boolean(fasNuevo) && fob.antiguedad === "ok";
    magyp.label = fasNuevo
      ? `MAGyP FOB/FAS oficial ${fob.fecha ?? ""}`.trim()
      : `${magyp.label} · fecha del dato ${fasOk ? "vigente" : "desactualizada"}`;
  } else if (fasNuevo) {
    sources.push({ id: "magyp", label: `MAGyP FOB/FAS oficial ${fob.fecha}`, ok: fob.antiguedad === "ok" });
  }

  const sorgo = plazas
    ? {
        cac: plazas.cac.granos.find((g) => g.grano === "sorgo") ?? null,
        afa: plazas.afa.granos.find((g) => g.grano === "sorgo") ?? null,
      }
    : null;

  const body = {
    ...base,
    asOf: (base.asOf as string | undefined) ?? new Date().toISOString(),
    sources,
    local: sumarSorgo(base.local, plazas),
    fas,
    fob: fasNuevo
      ? fasNuevo.map((it) => ({
          id: `oficial-${it.grain}`,
          label: it.label,
          origin: "MAGyP oficial",
          value: it.fob,
          asOf: it.asOf,
          asOfIso: it.asOfIso,
          antiguedad: it.antiguedad,
          ok: it.ok,
        }))
      : base.fob,
    fobOficial: fob,
    sorgo,
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
