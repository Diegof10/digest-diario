/**
 * Parser del texto del Panorama Agrícola Semanal (PAS) de la Bolsa de Cereales de Bs. As.
 * Entrada: texto plano (pdftotext -layout). Salida: cifras TAL CUAL las escribe el informe.
 * Regla: si un patrón no matchea con certeza → null (nunca estimar ni calcular).
 */

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

export const ZONAS_PAS = [
  { id: "I", nombre: "NOA", alias: ["NOA"] },
  { id: "II", nombre: "NEA", alias: ["NEA"] },
  { id: "III", nombre: "Centro-Norte de Córdoba", alias: ["Centro-Norte de Córdoba", "Centro Norte de Córdoba"] },
  { id: "IV", nombre: "Sur de Córdoba", alias: ["Sur de Córdoba"] },
  { id: "V", nombre: "Centro-Norte de Santa Fe", alias: ["Centro-Norte de Santa Fe", "Centro Norte de Santa Fe"] },
  { id: "VI", nombre: "Núcleo Norte", alias: ["Núcleo Norte"] },
  { id: "VII", nombre: "Núcleo Sur", alias: ["Núcleo Sur"] },
  { id: "VIII", nombre: "Centro-Este de Entre Ríos", alias: ["Centro-Este de Entre Ríos", "Centro Este de Entre Ríos"] },
  { id: "IX", nombre: "Norte de La Pampa - Oeste de Bs. As.", alias: ["Norte de La Pampa-Oeste de Buenos Aires", "Norte de La Pampa - Oeste de Buenos Aires", "Norte de La Pampa-Oeste de Bs As"] },
  { id: "X", nombre: "Centro de Buenos Aires", alias: ["Centro de Buenos Aires", "Centro de Bs As"] },
  { id: "XI", nombre: "Sudoeste de Bs. As. - Sur de La Pampa", alias: ["Sudoeste de Buenos Aires-Sur de La Pampa", "Sudoeste de Buenos Aires - Sur de La Pampa"] },
  { id: "XII", nombre: "Sudeste de Buenos Aires", alias: ["Sudeste de Buenos Aires", "sudeste bonaerense"] },
  { id: "XIII", nombre: "San Luis", alias: ["San Luis"] },
  { id: "XIV", nombre: "Cuenca del Salado", alias: ["Cuenca del Salado"] },
  { id: "XV", nombre: "Corrientes - Misiones", alias: ["Corrientes-Misiones", "Corrientes - Misiones"] },
];

const num = (s) => (s == null ? null : Number(String(s).replace(/\./g, "").replace(",", ".")));
const numArea = (s) => (s == null ? null : String(s).includes(",") ? num(s) : Number(s));
const flat = (t) => t.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").replace(/-\s(?=[a-záéíóú])/g, "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]?");

/** Fecha de tapa: "17 DE SEPTIEMBRE DE 2026" → "2026-09-17" */
export function parseFechaInforme(text) {
  const m = text.match(/(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚa-záéíóú]+)\s+DE\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

export function parseRelevamiento(text) {
  const m = text.match(/RELEVAMIENTO AL\s+(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Párrafo del cuerpo (antes de los recuadros por cultivo) que menciona el cultivo. */
function bloque(body, re) {
  const m = body.match(re);
  if (!m) return null;
  const start = m.index;
  // corta en el siguiente párrafo temático (heurística: próximo "Por su parte, la siembra de|En cuanto al|Finalmente,")
  const rest = body.slice(start + 1);
  const cut = rest.search(/(Por su parte, la siembra de|En cuanto al |Finalmente, |En paralelo, la cosecha de)/);
  return body.slice(start, cut >= 0 ? start + 1 + cut : undefined);
}

function vsAnioAnterior(par) {
  // sólo si el informe da un número explícito en p.p. contra la campaña previa / año anterior
  const m = par.match(/(adelanto|demora|retraso|mejora)[^.]{0,40}?de\s+(\d+(?:,\d+)?)\s*p\.?\s*p\.?[^.]{0,60}?(campaña previa|campaña anterior|año anterior|ciclo previo|interanual)/i)
    || par.match(/(demora|retraso|adelanto) interanual de\s+(\d+(?:,\d+)?)\s*(puntos|p\.?\s*p\.?)/i);
  if (!m) return null;
  const v = num(m[2]);
  return /demora|retraso/i.test(m[1]) ? -v : v;
}

function zonasEn(par, patrones) {
  const out = {};
  for (const z of ZONAS_PAS) {
    for (const a of z.alias) {
      for (const p of patrones) {
        const re = new RegExp(p.replace("ZONA", esc(a)), "i");
        const m = par.match(re);
        if (m) { out[z.id] = num(m[1]); break; }
      }
      if (out[z.id] != null) break;
    }
  }
  return out;
}

const ZONA_SIEMBRA = [
  "en (?:el |la )?ZONA,? donde ya se implantó el (\\d+(?:,\\d+)?)\\s?%",
  "en (?:el |la )?ZONA,? donde las labores alcanzan el (\\d+(?:,\\d+)?)\\s?%",
  "en (?:el |la )?ZONA,? la siembra (?:alcanza|cubre) el (\\d+(?:,\\d+)?)\\s?%",
];

export function parsePas(text) {
  const fecha = parseFechaInforme(text);
  const relevamientoAl = parseRelevamiento(text);
  const bodyStart = text.search(/Al presente informe/i);
  const body = flat(bodyStart >= 0 ? text.slice(bodyStart) : text);
  const cultivos = {};

  // MAÍZ siembra
  const pm = bloque(body, /siembra de maíz[^.]*?alcanza/i);
  if (pm) {
    const m = pm.match(/siembra de maíz[^.]*?(\d{4}\/\d{2})?[^.]*?alcanza el (\d+(?:,\d+)?)\s?% de las ([\d.,]+)\s?MHa[^.]*?progreso intersemanal de (\d+(?:,\d+)?)\s?(?:p\.?\s?p\.?|%)/i);
    const camp = pm.match(/(\d{4}\/\d{2})/);
    if (m) {
      cultivos.maiz = cultivos.maiz || { metricas: {} };
      cultivos.maiz.metricas.siembra = {
        campana: camp ? camp[1] : null,
        nacional: num(m[2]), areaMHa: numArea(m[3]), varSemanalPp: num(m[4]),
        vsAnioAnteriorPp: vsAnioAnterior(pm),
        zonas: zonasEn(pm, ZONA_SIEMBRA),
      };
    }
  }
  // MAÍZ cosecha
  const mc = body.match(/cosecha de maíz (\d{4}\/\d{2}) alcanza el (\d+(?:,\d+)?)\s?% del área apta/i);
  if (mc) {
    cultivos.maiz = cultivos.maiz || { metricas: {} };
    const pc = bloque(body, /cosecha de maíz \d{4}\/\d{2} alcanza/i) || "";
    const ws = pc.match(/progreso intersemanal de (\d+(?:,\d+)?)\s?(?:p\.?\s?p\.?|%)/i);
    cultivos.maiz.metricas.cosecha = {
      campana: mc[1], nacional: num(mc[2]), varSemanalPp: ws ? num(ws[1]) : null,
      vsAnioAnteriorPp: vsAnioAnterior(pc), zonas: {},
    };
  }
  // GIRASOL siembra
  const pg = bloque(body, /siembra de girasol (?:cubre|alcanza)/i);
  if (pg) {
    const m = pg.match(/siembra de girasol (?:cubre|alcanza) el (\d+(?:,\d+)?)\s?% de las ([\d.,]+)\s?MHa[^.]*?(\d{4}\/\d{2})?[^.]*?progreso intersemanal de (\d+(?:,\d+)?)\s?(?:p\.?\s?p\.?|%)/i);
    if (m) {
      cultivos.girasol = { metricas: { siembra: {
        campana: m[3] || (pg.match(/(\d{4}\/\d{2})/) || [])[1] || null,
        nacional: num(m[1]), areaMHa: numArea(m[2]), varSemanalPp: num(m[4]),
        vsAnioAnteriorPp: vsAnioAnterior(pg), zonas: zonasEn(pg, ZONA_SIEMBRA),
      } } };
    }
  }
  // TRIGO condición
  const pt = bloque(body, /En cuanto al trigo/i) || body;
  const tc = pt.match(/(\d+(?:,\d+)?)\s?% del área presenta condición de cultivo entre Normal a Excelente/i)
    || body.match(/trigo[^.]*?condición de cultivo[^.]*?Normal (?:a|\/) Excelente en el (\d+(?:,\d+)?)\s?%/i);
  if (tc) cultivos.trigo = { metricas: { condicion: { categoria: "Normal a Excelente", nacional: num(tc[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };
  // CEBADA condición
  const cb = body.match(/cebada[^]*?(\d+(?:,\d+)?)\s?% bajo una condición de cultivo (Normal a Buena|Normal a Excelente)/i);
  if (cb) cultivos.cebada = { metricas: { condicion: { categoria: cb[2], nacional: num(cb[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };
  // SOJA siembra (sólo si el informe la menciona con número)
  const sj = body.match(/siembra de soja[^.]*?(?:alcanza|cubre) el (\d+(?:,\d+)?)\s?%/i);
  if (sj) cultivos.soja = { metricas: { siembra: { nacional: num(sj[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };

  return { fecha, relevamientoAl, cultivos };
}
