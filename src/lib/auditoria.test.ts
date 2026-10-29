import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { a3500Vigente, parseA3500 } from "./bcra";
import { aUsdTon, elegirCierre } from "./cbot";
import { parseMagypPrecios } from "./fob-fas";
import { lineaSinNovedad } from "./fiscal";
import { esperaReintento, rubrosDe } from "./fiscal-cron";
import { diasCorridos, marcaAntiguedad, UMBRAL_CLIMA_BASE_DIAS, UMBRAL_FAS_DIAS } from "./habiles";
import { parseBna } from "./plazas";

const HOY = "2026-10-29";

describe("antigüedad por fuente", () => {
  it("FAS del 02/09 no está ok", () => {
    assert.equal(diasCorridos("2026-09-02", HOY), 57);
    assert.equal(marcaAntiguedad("2026-09-02", UMBRAL_FAS_DIAS, HOY), "desactualizado");
  });

  it("FAS de ayer sigue ok", () => {
    assert.equal(marcaAntiguedad("2026-10-28", UMBRAL_FAS_DIAS, HOY), "ok");
    assert.equal(marcaAntiguedad("2026-10-26", UMBRAL_FAS_DIAS, HOY), "ok");
    assert.equal(marcaAntiguedad("2026-10-25", UMBRAL_FAS_DIAS, HOY), "desactualizado");
  });

  it("boletines de clima de base citados en la auditoría están desactualizados", () => {
    assert.equal(marcaAntiguedad("2026-09-30", UMBRAL_CLIMA_BASE_DIAS, HOY), "desactualizado");
    assert.equal(marcaAntiguedad("2026-10-13", UMBRAL_CLIMA_BASE_DIAS, HOY), "desactualizado");
    assert.equal(marcaAntiguedad("2026-10-20", UMBRAL_CLIMA_BASE_DIAS, HOY), "desactualizado");
    assert.equal(marcaAntiguedad("2026-10-22", UMBRAL_CLIMA_BASE_DIAS, HOY), "ok");
  });
});

describe("CBOT cierre con fecha", () => {
  const barras = [
    { ts: 1793160000, close: 1224.5 },
    { ts: 1793246400, close: 1234.25 },
  ];

  it("antes de las 13:20 CT usa el cierre de la sesión anterior", () => {
    const c = elegirCierre(barras, new Date("2026-10-29T16:36:41Z"));
    assert.ok(c);
    assert.equal(c.fecha, "2026-10-28");
    assert.equal(c.centavos, 1224.5);
    assert.equal(c.enCursoDescartada, true);
    assert.equal(aUsdTon("soja", c.centavos), 449.9);
  });

  it("después de la liquidación usa la vela del día", () => {
    const c = elegirCierre(barras, new Date("2026-10-29T18:30:00Z"));
    assert.equal(c?.fecha, "2026-10-29");
    assert.equal(c?.centavos, 1234.25);
  });
});

describe("A3500 y BNA", () => {
  it("lee tipoCotizacion de la API de estadísticas cambiarias", () => {
    const serie = parseA3500({
      results: [
        { fecha: "2026-10-27", detalle: [{ codigoMoneda: "USD", tipoCotizacion: 1538 }] },
        { fecha: "2026-10-28", detalle: [{ codigoMoneda: "USD", tipoCotizacion: 1542 }] },
      ],
    });
    assert.equal(a3500Vigente(serie, "2026-10-28")?.valor, 1542);
    assert.equal(a3500Vigente(serie, "2026-10-29")?.fecha, "2026-10-28");
    assert.equal(serie[0].fuente.includes("A3500"), true);
  });

  it("separa billete venta de divisa comprador", () => {
    const txt =
      "29/10/2026 Compra Venta Dolar U.S.A 1510,00 1560,00 Euro 1680,00 1780,00 " +
      "28/10/2026 Compra Venta Dolar U.S.A 1533.0000 1542.0000";
    const b = parseBna(txt);
    assert.equal(b.billeteVenta?.valor, 1560);
    assert.equal(b.billeteVenta?.fecha, "2026-10-29");
    assert.match(b.billeteVenta?.fuente ?? "", /billete venta/);
    assert.equal(b.divisaCompra?.valor, 1533);
    assert.match(b.divisaCompra?.fuente ?? "", /divisa comprador/);
    assert.notEqual(b.billeteVenta?.fuente, b.divisaCompra?.fuente);
  });
});

describe("FOB/FAS MAGyP", () => {
  it("parsea FOB y FAS con fecha, incluido el sorgo", () => {
    const html = `
      <h3>Cotizaciones de granos a:  28/10/2026</h3>
      <img alt="trigo" /> FOB:  241  USD/t <br> <span></span>:  318.849  $/t
      <img alt="maiz" /> FOB:  206  USD/t <br> :  268.030  $/t
      <img alt="girasol" /> FOB:  603  USD/t <br> :  633.773  $/t
      <img alt="soja" /> FOB:  481  USD/t <br> :  563.761  $/t
      <img alt="sorgo" /> FOB:  225 USD/t <br> :  288.173  $/t
    `;
    const p = parseMagypPrecios(html);
    assert.ok(p);
    assert.equal(p.fecha, "2026-10-28");
    const sorgo = p.items.find((i) => i.grano === "sorgo");
    assert.equal(sorgo?.fobUsd, 225);
    assert.equal(sorgo?.fasArs, 288173);
    assert.equal(p.items.find((i) => i.grano === "soja")?.fasArs, 563761);
    assert.equal(marcaAntiguedad(p.fecha, UMBRAL_FAS_DIAS, HOY), "ok");
  });
});

describe("fiscal", () => {
  it("corrida fallida no dice sin novedad", () => {
    assert.equal(lineaSinNovedad(false, "2026-10-21T11:05:29.158Z"), "dato al 21/10/2026");
    assert.equal(lineaSinNovedad(false, "2026-10-21"), "dato al 21/10/2026");
    assert.equal(lineaSinNovedad(true, "2026-10-21"), "Sin novedad fiscal");
    assert.equal(lineaSinNovedad(null, null), "Sin novedad fiscal");
  });

  it("la sección primera prioriza RG y decretos, y reintenta con backoff", () => {
    assert.deepEqual(rubrosDe(0).map((r) => r.id), ["63", "24", "1715"]);
    assert.deepEqual(rubrosDe(2).map((r) => r.id), ["63", "24"]);
    assert.equal(esperaReintento(0), 500);
    assert.ok(esperaReintento(1) > esperaReintento(0));
  });
});
