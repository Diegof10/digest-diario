import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ClimaVivo from "../components/ClimaVivo";
import { buildLecturaCards } from "./lectura-cards";
import type { FiscalSnapshot, MercadoSnapshot } from "./types";
import {
  CLIMA_VIVO_FUENTE,
  CLIMA_VIVO_TIMEOUT_MS,
  CLIMA_VIVO_URL,
  cabeceraClimaVivo,
  climaVivoParaHome,
  getClimaVivo,
  mergeClimaPersistido,
  resetClimaVivoCache,
  urlClimaVivo,
  type ClimaCiudad,
  type ClimaVivoSnapshot,
} from "./clima-vivo";

/** 13:00 ART del 6/11/2026. */
const NOW = new Date("2026-11-06T16:00:00.000Z");
const HORA = "2026-11-06T12:45";

type Row = { time: string; temp: number; code?: number; wind?: number; dir?: number };

function fila(r: Row) {
  return {
    current: {
      time: r.time,
      temperature_2m: r.temp,
      weather_code: r.code ?? 1,
      wind_speed_10m: r.wind ?? 10.2,
      wind_direction_10m: r.dir ?? 225,
    },
  };
}

function cuerpo(rows: Array<Row | null>) {
  return rows.map((r) => (r ? fila(r) : {}));
}

const TRES: Row[] = [
  { time: HORA, temp: 24.5, code: 1, wind: 10.2, dir: 225 },
  { time: HORA, temp: 27.3, code: 0, wind: 14.9, dir: 180 },
  { time: HORA, temp: 26.4, code: 1, wind: 4.6, dir: 90 },
];

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchDe(body: unknown, status = 200, cap?: { url?: string; init?: RequestInit }) {
  return async (url: string, init?: RequestInit) => {
    if (cap) {
      cap.url = url;
      cap.init = init;
    }
    return jsonRes(body, status);
  };
}

function ciudad(p: Partial<ClimaCiudad> & Pick<ClimaCiudad, "id" | "nombre">): ClimaCiudad {
  return {
    tempC: null,
    condicion: null,
    code: null,
    vientoKmh: null,
    vientoDir: null,
    horaDato: null,
    error: null,
    ...p,
  };
}

function snap(ciudades: ClimaCiudad[], extra: Partial<ClimaVivoSnapshot> = {}): ClimaVivoSnapshot {
  return {
    fuente: CLIMA_VIVO_FUENTE,
    url: CLIMA_VIVO_URL,
    ciudades,
    leidoAt: NOW.toISOString(),
    estado: "ok",
    errorLectura: null,
    datoLeidoAt: NOW.toISOString(),
    ...extra,
  };
}

function tres(temp: number, hora: string, leidoAt: string): ClimaVivoSnapshot {
  const nombres = [
    ["caba", "Buenos Aires"],
    ["santafe", "Santa Fe"],
    ["cordoba", "Córdoba"],
  ] as const;
  return snap(
    nombres.map(([id, nombre]) =>
      ciudad({
        id,
        nombre,
        tempC: temp,
        condicion: "despejado",
        code: 0,
        vientoKmh: 8,
        vientoDir: "N",
        horaDato: hora,
      }),
    ),
    { leidoAt, datoLeidoAt: leidoAt, estado: "ok", errorLectura: null },
  );
}

function sinDato(leidoAt: string, error: string): ClimaVivoSnapshot {
  const nombres = [
    ["caba", "Buenos Aires"],
    ["santafe", "Santa Fe"],
    ["cordoba", "Córdoba"],
  ] as const;
  return snap(
    nombres.map(([id, nombre]) => ciudad({ id, nombre, error })),
    { leidoAt, estado: "sin_dato", errorLectura: error, datoLeidoAt: null },
  );
}

function assertSinTemps(s: ClimaVivoSnapshot, prohibido: number) {
  assert.equal(s.estado === "ok", false);
  for (const c of s.ciudades) assert.equal(c.tempC, null);
  assert.equal(JSON.stringify(s).includes(String(prohibido)), false);
}

const mercado = { ok: true, rows: [], note: "", fetchedAt: NOW.toISOString() } as MercadoSnapshot;
const fiscal = {
  ok: true,
  novedad: "sin novedad fiscal",
  fuente: null,
  fetchedAt: NOW.toISOString(),
  fecha: "2026-11-06",
  actualizadoAt: null,
  novedades: [],
  vencimientos: [],
  lineaTablero: "",
  pie: null,
} as FiscalSnapshot;

beforeEach(() => resetClimaVivoCache());

describe("lectura Open-Meteo de clima ahora", () => {
  it("usa la respuesta vigente y no inventa otra temperatura", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    const s = await getClimaVivo({ fetchImpl: fetchDe(cuerpo(TRES), 200, cap), now: NOW });
    assert.equal(s.estado, "ok");
    assert.equal(s.errorLectura, null);
    assert.deepEqual(
      s.ciudades.map((c) => c.tempC),
      [24.5, 27.3, 26.4],
    );
    assert.equal(s.ciudades[0].condicion, "mayormente despejado");
    assert.equal(s.ciudades[1].condicion, "despejado");
    assert.equal(s.ciudades[0].vientoDir, "SO");
    assert.equal(s.ciudades[0].vientoKmh, 10.2);
    assert.equal(s.ciudades[0].horaDato, HORA);
    assert.equal(s.ciudades.every((c) => c.error == null), true);
    assert.equal(cap.init?.cache, "no-store");
    assert.equal("next" in (cap.init ?? {}), false);
    assert.ok(cap.init?.signal);
    assert.match(cap.url ?? "", /current=temperature_2m/);
    assert.match(cap.url ?? "", /latitude=-34\.61%2C-31\.63%2C-31\.42|-34\.61,-31\.63,-31\.42/);
    assert.doesNotMatch(cap.url ?? "", /forecast_days/);
    assert.equal(CLIMA_VIVO_TIMEOUT_MS, 15_000);
    assert.ok(CLIMA_VIVO_TIMEOUT_MS > 8_000);
    const cab = cabeceraClimaVivo(s);
    assert.equal(cab.titulo, "CLIMA AHORA");
    assert.match(cab.linea, /^act\. \d{2}:\d{2}$/);
    assert.doesNotMatch(cab.linea, /último valor|sin dato/);
  });

  it("un objeto único no rellena las otras ciudades", async () => {
    const s = await getClimaVivo({ fetchImpl: fetchDe(fila(TRES[0])), now: NOW });
    assert.equal(s.estado, "ok");
    assert.equal(s.ciudades[0].tempC, 24.5);
    assert.equal(s.ciudades[1].tempC, null);
    assert.equal(s.ciudades[1].error, "respuesta sin dato");
  });

  it("timeout: sin dato, con marca, y también si el fetch ignora el abort", async () => {
    const abortado = await getClimaVivo({
      now: NOW,
      timeoutMs: 30,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("The operation was aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    });
    assert.equal(abortado.estado, "sin_dato");
    assert.match(abortado.errorLectura ?? "", /timeout 0s|timeout 1s|timeout/);
    assertSinTemps(abortado, 24.5);

    const colgado = await getClimaVivo({
      now: NOW,
      timeoutMs: 30,
      fetchImpl: () => new Promise(() => {}),
    });
    assert.equal(colgado.estado, "sin_dato");
    assert.match(colgado.errorLectura ?? "", /^timeout /);
    assert.equal(colgado.leidoAt, NOW.toISOString());
    assertSinTemps(colgado, 99);
  });

  it("error de red", async () => {
    const s = await getClimaVivo({
      now: NOW,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.equal(s.estado, "sin_dato");
    assert.match(s.errorLectura ?? "", /fetch failed/);
    assertSinTemps(s, 24.5);
  });

  it("HTTP con razón y JSON inválido", async () => {
    const http = await getClimaVivo({
      now: NOW,
      fetchImpl: async () => jsonRes({ reason: "upstream down" }, 502),
    });
    assert.equal(http.estado, "sin_dato");
    assert.match(http.errorLectura ?? "", /HTTP 502: upstream down/);
    assertSinTemps(http, 24.5);

    const malo = await getClimaVivo({
      now: NOW,
      fetchImpl: async () => new Response("no-json", { status: 200 }),
    });
    assert.equal(malo.errorLectura, "respuesta no es JSON");
    assertSinTemps(malo, 24.5);

    const incompleto = await getClimaVivo({
      now: NOW,
      fetchImpl: fetchDe([{ current: { time: HORA } }, {}, {}]),
    });
    assert.equal(incompleto.estado, "sin_dato");
    assert.equal(incompleto.ciudades[0].error, "respuesta sin dato");
    assertSinTemps(incompleto, 24.5);
  });

  it("dato de más de 2 h no se muestra como temperatura", async () => {
    const s = await getClimaVivo({
      now: NOW,
      fetchImpl: fetchDe(cuerpo(TRES.map((r) => ({ ...r, time: "2026-11-06T08:00", temp: 99 })))),
    });
    assert.equal(s.estado, "sin_dato");
    assert.equal(s.errorLectura, "dato de más de 2 h");
    assert.equal(s.ciudades[0].horaDato, "2026-11-06T08:00");
    assertSinTemps(s, 99);
  });

  it("loguea el fallo sin secretos", async () => {
    const prevE = console.error;
    const lines: string[] = [];
    console.error = (m?: unknown) => {
      lines.push(String(m));
    };
    try {
      await getClimaVivo({
        now: NOW,
        timeoutMs: 20,
        fetchImpl: () => new Promise(() => {}),
      });
    } finally {
      console.error = prevE;
    }
    assert.ok(lines.some((l) => l.includes("[clima-vivo]") && l.includes("lectura_fallida") && l.includes("timeout")));
    assert.ok(lines.every((l) => !/Bearer|BLOB_|CRON_SECRET|token|api[_-]?key/i.test(l)));
  });
});

describe("snapshot del digest", () => {
  it("un sin dato congelado no pisa una lectura nueva", async () => {
    const frozen = sinDato("2026-11-06T14:27:52.000Z", "timeout 8s");
    const out = await climaVivoParaHome(frozen, { now: NOW, fetchImpl: fetchDe(cuerpo(TRES)) });
    assert.equal(out.estado, "ok");
    assert.deepEqual(
      out.ciudades.map((c) => [c.nombre, c.tempC]),
      [
        ["Buenos Aires", 24.5],
        ["Santa Fe", 27.3],
        ["Córdoba", 26.4],
      ],
    );
    assert.equal(out.errorLectura, null);
    assert.doesNotMatch(JSON.stringify(out), /timeout 8s/);
  });

  it("si la red falla, el último valor de menos de 2 h queda rotulado como tal", async () => {
    const prev = tres(18, "2026-11-06T12:30", "2026-11-06T15:20:00.000Z");
    const out = await climaVivoParaHome(prev, {
      now: NOW,
      timeoutMs: 20,
      fetchImpl: () => new Promise(() => {}),
    });
    assert.equal(out.estado, "stale");
    assert.equal(out.ciudades[0].tempC, 18);
    assert.match(out.errorLectura ?? "", /^timeout /);
    assert.equal(out.datoLeidoAt, prev.leidoAt);
    const cab = cabeceraClimaVivo(out);
    assert.equal(cab.titulo, "CLIMA · último valor");
    assert.match(cab.linea, /último valor/);
    assert.match(cab.linea, /sin actualización/);
    assert.match(cab.linea, /12:30/);
    assert.doesNotMatch(cab.linea, /act\./);
  });

  it("un valor de más de 2 h no se recicla cuando la red falla", async () => {
    const viejo = tres(18, "2026-11-06T10:00", "2026-11-06T13:05:00.000Z");
    const out = await climaVivoParaHome(viejo, {
      now: NOW,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.equal(out.estado, "sin_dato");
    assertSinTemps(out, 18);
    assert.match(cabeceraClimaVivo(out).linea, /^lectura /);
  });

  it("una respuesta vieja no reemplaza al último valor vigente ni se presenta como actual", async () => {
    const prev = tres(18, "2026-11-06T12:30", "2026-11-06T15:20:00.000Z");
    const out = await climaVivoParaHome(prev, {
      now: NOW,
      fetchImpl: fetchDe(cuerpo(TRES.map((r) => ({ ...r, time: "2026-11-06T08:00", temp: 99 })))),
    });
    assert.equal(out.estado, "stale");
    assert.equal(out.ciudades.every((c) => c.tempC === 18), true);
    assert.equal(JSON.stringify(out).includes("99"), false);
    assert.notEqual(out.estado, "ok");
  });

  it("no consulta la red si el snapshot guardado es vigente y reciente", async () => {
    let calls = 0;
    const prev = tres(22, HORA, new Date(NOW.getTime() - 2 * 60_000).toISOString());
    const out = await climaVivoParaHome(prev, {
      now: NOW,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("no debía consultar");
      },
    });
    assert.equal(calls, 0);
    assert.equal(out.estado, "ok");
    assert.equal(out.ciudades[0].tempC, 22);
  });

  it("un sin dato reciente sí se vuelve a consultar", async () => {
    let calls = 0;
    const prev = sinDato(new Date(NOW.getTime() - 60_000).toISOString(), "timeout 8s");
    const out = await climaVivoParaHome(prev, {
      now: NOW,
      fetchImpl: async () => {
        calls += 1;
        return jsonRes(cuerpo(TRES));
      },
    });
    assert.equal(calls, 1);
    assert.equal(out.estado, "ok");
    assert.equal(out.ciudades[2].tempC, 26.4);
  });

  it("al guardar el digest, un fallo no borra el último valor ni lo marca ok", async () => {
    const prev = tres(18, "2026-11-06T12:30", "2026-11-06T15:20:00.000Z");
    const failed = await getClimaVivo({
      now: NOW,
      timeoutMs: 20,
      fetchImpl: () => new Promise(() => {}),
    });
    const merged = mergeClimaPersistido(prev, failed, NOW);
    assert.equal(merged.estado, "stale");
    assert.equal(merged.ciudades[1].tempC, 18);
    assert.notEqual(merged, failed);

    const ok = await getClimaVivo({ now: NOW, fetchImpl: fetchDe(cuerpo(TRES)) });
    const replaced = mergeClimaPersistido(merged, ok, NOW);
    assert.equal(replaced, ok);
    assert.equal(replaced.estado, "ok");
    assert.equal(replaced.ciudades[0].tempC, 24.5);
  });
});

describe("textos de la home", () => {
  it("tema en uso: dato bueno, último valor y sin dato", async () => {
    const ok = await getClimaVivo({ now: NOW, fetchImpl: fetchDe(cuerpo(TRES)) });
    const htmlOk = renderToStaticMarkup(createElement(ClimaVivo, { clima: ok, tema: "a" }));
    assert.match(htmlOk, /CLIMA AHORA/);
    assert.match(htmlOk, /act\./);
    assert.match(htmlOk, /24,5|24\.5/);
    assert.match(htmlOk, /Buenos Aires/);
    assert.match(htmlOk, /Santa Fe/);
    assert.match(htmlOk, /Córdoba/);
    assert.doesNotMatch(htmlOk, /último valor/);
    assert.doesNotMatch(htmlOk, /sin dato/);

    const prev = tres(18, "2026-11-06T12:30", "2026-11-06T15:20:00.000Z");
    const stale = await climaVivoParaHome(prev, {
      now: NOW,
      timeoutMs: 20,
      fetchImpl: () => new Promise(() => {}),
    });
    const htmlStale = renderToStaticMarkup(createElement(ClimaVivo, { clima: stale, tema: "a" }));
    assert.match(htmlStale, /último valor/);
    assert.match(htmlStale, /sin actualización/);
    assert.match(htmlStale, />18°|18 °C|>18</);
    assert.doesNotMatch(htmlStale, /act\./);
    assert.doesNotMatch(htmlStale, /CLIMA AHORA/);

    const vacio = sinDato(NOW.toISOString(), "timeout 15s");
    const htmlVacio = renderToStaticMarkup(createElement(ClimaVivo, { clima: vacio, tema: "a" }));
    assert.match(htmlVacio, /sin dato/);
    assert.match(htmlVacio, /timeout 15s/);
    assert.match(htmlVacio, /lectura /);
    assert.doesNotMatch(htmlVacio, /°/);
    assert.doesNotMatch(htmlVacio, /act\./);
  });

  it("la tarjeta de lectura no presenta el último valor como lectura nueva", async () => {
    const ok = await getClimaVivo({ now: NOW, fetchImpl: fetchDe(cuerpo(TRES)) });
    const cardsOk = await buildLecturaCards(mercado, fiscal, ok);
    const climaOk = cardsOk.find((c) => c.id === "clima")!.sections[0];
    assert.match(climaOk.titulo, /zona núcleo/);
    assert.doesNotMatch(climaOk.titulo, /último valor/);
    assert.match(climaOk.resumen, /24,5|24\.5/);

    const stale = mergeClimaPersistido(
      tres(18, "2026-11-06T12:30", "2026-11-06T15:20:00.000Z"),
      sinDato(NOW.toISOString(), "timeout 15s"),
      NOW,
    );
    const cardsStale = await buildLecturaCards(mercado, fiscal, stale);
    const climaStale = cardsStale.find((c) => c.id === "clima")!.sections[0];
    assert.match(climaStale.titulo, /último valor/);
    assert.match(climaStale.resumen, /no es una lectura nueva/);
    assert.match(climaStale.resumen, /18/);
    assert.doesNotMatch(climaStale.titulo, /zona núcleo/);

    const cardsVacio = await buildLecturaCards(mercado, fiscal, sinDato(NOW.toISOString(), "HTTP 502"));
    const climaVacio = cardsVacio.find((c) => c.id === "clima")!.sections[0];
    assert.match(climaVacio.titulo, /sin dato/);
    assert.match(climaVacio.resumen, /HTTP 502/);
    assert.doesNotMatch(climaVacio.resumen, /\d+ °C/);
  });
});

describe("la caché de la instancia no esconde el bypass del cron", () => {
  it("repite la lectura sólo si se pide bypass, y un fallo no se cachea como éxito", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    let mode: "ok" | "fail" = "ok";
    const hora = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(" ", "T")
      .replace(/^24:/, "00:")
      .slice(0, 16);
    globalThis.fetch = (async () => {
      calls += 1;
      if (mode === "fail") throw new TypeError("fetch failed");
      return jsonRes(cuerpo(TRES.map((r) => ({ ...r, time: hora }))));
    }) as typeof fetch;
    try {
      const a = await getClimaVivo();
      const b = await getClimaVivo();
      assert.equal(a.estado, "ok");
      assert.equal(b.estado, "ok");
      assert.equal(calls, 1);
      mode = "fail";
      const c = await getClimaVivo({ bypassCache: true });
      assert.equal(c.estado, "sin_dato");
      assert.match(c.errorLectura ?? "", /fetch failed/);
      assert.equal(calls, 2);
      const d = await getClimaVivo();
      assert.equal(d.estado, "sin_dato");
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = orig;
      resetClimaVivoCache();
    }
  });
});

describe("regresión de cableado", () => {
  it("la home resuelve clima ahora y el pronóstico de 7 días sigue en su cron", () => {
    const home = readFileSync(new URL("./home-data.ts", import.meta.url), "utf8");
    assert.match(home, /climaVivoParaHome\(saved\.climaVivo\)/);
    assert.match(home, /mergeClimaPersistido\(prev\?\.climaVivo/);
    assert.doesNotMatch(home, /climaVivo:\s*saved\.climaVivo/);
    const vivo = readFileSync(new URL("./clima-vivo.ts", import.meta.url), "utf8");
    assert.match(vivo, /cache:\s*"no-store"/);
    assert.doesNotMatch(vivo, /revalidate:\s*600/);
    const cron = readFileSync(new URL("./clima-cron.ts", import.meta.url), "utf8");
    assert.match(cron, /conTimeout\(20_000/);
    assert.match(cron, /cache:\s*"no-store"/);
    assert.match(cron, /forecast_days/);
    assert.equal(urlClimaVivo().includes("forecast_days"), false);
  });
});
