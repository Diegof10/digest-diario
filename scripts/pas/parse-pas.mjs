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

const PP = String.raw`(?:p\.?\s?p\.?|%|puntos porcentuales)`;
const N = String.raw`(\d+(?:,\d+)?)`;
const rx = (src) => new RegExp(src, "i");

function vsAnioAnterior(par) {
  // sólo número explícito contra la campaña previa / año anterior; "alrededor de" o "aproximadamente" → null
  const m = par.match(rx(String.raw`(adelanto|demora|retraso|mejora)\s+(?:interanual\s+)?de\s+((?:alrededor de|aproximadamente|cerca de)\s+)?` + N + String.raw`\s?` + PP + String.raw`[^.]{0,40}?(campaña previa|campaña anterior|año anterior|ciclo previo)`))
    || par.match(rx(String.raw`(demora|retraso|adelanto) interanual de\s+()` + N + String.raw`\s?` + PP));
  if (!m || m[2]) return null;
  const v = num(m[3]);
  return /demora|retraso/i.test(m[1]) ? -v : v;
}

function zonasEn(par, patrones) {
  const out = {};
  for (const z of ZONAS_PAS) {
    for (const a of z.alias) {
      for (const p of patrones) {
        const m = par.match(rx(p.replace("ZONA", esc(a))));
        if (m) { out[z.id] = num(m[1]); break; }
      }
      if (out[z.id] != null) break;
    }
  }
  return out;
}

const ZONA_SIEMBRA = [
  String.raw`en (?:el |la )?ZONA,? donde ya se implantó el (\d+(?:,\d+)?)\s?%`,
  String.raw`en (?:el |la )?ZONA,? donde las labores alcanzan el (\d+(?:,\d+)?)\s?%`,
  String.raw`en (?:el |la )?ZONA,? la siembra (?:alcanza|cubre) el (\d+(?:,\d+)?)\s?%`,
];

/** Oraciones de un párrafo (corta en ". " seguido de mayúscula). */
const oraciones = (par) => par.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/);

export function parsePas(text) {
  const fecha = parseFechaInforme(text);
  const relevamientoAl = parseRelevamiento(text);
  const i0 = text.search(/Al presente informe/i);
  const raw = i0 >= 0 ? text.slice(i0) : text;
  // cuerpo = hasta los recuadros por cultivo (línea que empieza con MAÍZ/GIRASOL/TRIGO en mayúsculas)
  const iBox = raw.search(/\n\s*(MAÍZ|GIRASOL|TRIGO|CEBADA)\s{2,}/);
  const cuerpo = iBox > 0 ? raw.slice(0, iBox) : raw;
  const recuadros = flat(iBox > 0 ? raw.slice(iBox) : "");
  const pars = cuerpo.split(/\n\s*\n/).map(flat).filter(Boolean);
  const parDe = (re) => pars.find((p) => re.test(p)) || "";
  const cultivos = {};

  // MAÍZ siembra (oración de siembra dentro del párrafo de maíz)
  const pm = parDe(/siembra de maíz/i);
  const om = oraciones(pm).find((o) => /siembra de maíz/i.test(o)) || "";
  const m1 = om.match(rx(String.raw`siembra de maíz[^.]*?(\d{4}\/\d{2})[^.]*?alcanza el ` + N + String.raw`\s?% de las ([\d.,]+)\s?MHa[^.]*?progreso intersemanal de ` + N + String.raw`\s?` + PP));
  if (m1) {
    const zonasPar = pm.split(/En paralelo, la cosecha/i)[0];
    const vsRec = recuadros.match(rx(String.raw`La siembra de maíz \d{4}\/\d{2} alcanza el [\d,]+\s?%, con (?:un|una)[\s\S]{0,200}?(adelanto|demora|retraso) de ` + N + String.raw`\s?p\.?\s?p\.? respecto de la campaña previa`));
    cultivos.maiz = { metricas: { siembra: {
      campana: m1[1], nacional: num(m1[2]), areaMHa: numArea(m1[3]), varSemanalPp: num(m1[4]),
      vsAnioAnteriorPp: vsAnioAnterior(zonasPar) ?? (vsRec ? (/demora|retraso/i.test(vsRec[1]) ? -num(vsRec[2]) : num(vsRec[2])) : null),
      zonas: zonasEn(zonasPar, ZONA_SIEMBRA),
    } } };
  }
  // MAÍZ cosecha (sin variación semanal salvo que la oración la traiga)
  const oc = oraciones(pm).find((o) => /cosecha de maíz \d{4}\/\d{2}/i.test(o)) || "";
  const mc = oc.match(rx(String.raw`cosecha de maíz (\d{4}\/\d{2}) alcanza el ` + N + String.raw`\s?% del área apta`));
  if (mc) {
    const ws = oc.match(rx(String.raw`progreso intersemanal de ` + N + String.raw`\s?` + PP));
    cultivos.maiz = cultivos.maiz || { metricas: {} };
    cultivos.maiz.metricas.cosecha = { campana: mc[1], nacional: num(mc[2]), varSemanalPp: ws ? num(ws[1]) : null, vsAnioAnteriorPp: vsAnioAnterior(oc), zonas: {} };
  }
  // GIRASOL siembra
  const pg = parDe(/siembra de girasol/i);
  const og = oraciones(pg).find((o) => /siembra de girasol (?:cubre|alcanza)/i.test(o)) || "";
  const g1 = og.match(rx(String.raw`siembra de girasol (?:cubre|alcanza) el ` + N + String.raw`\s?% de las ([\d.,]+)\s?MHa[^.]*?progreso intersemanal de ` + N + String.raw`\s?` + PP));
  const g2 = og.match(rx(String.raw`progreso intersemanal de ` + N + String.raw`\s?` + PP + String.raw`[.,]*\s*la siembra de girasol (?:cubre|alcanza) el ` + N + String.raw`\s?% de una superficie cuya proyección se ajusta a ([\d.,]+)\s?MHa`));
  if (g1 || g2) {
    cultivos.girasol = { metricas: { siembra: {
      campana: (pg.match(/(\d{4}\/\d{2})/) || [])[1] || null,
      nacional: num(g1 ? g1[1] : g2[2]), areaMHa: numArea(g1 ? g1[2] : g2[3]), varSemanalPp: num(g1 ? g1[3] : g2[1]),
      vsAnioAnteriorPp: vsAnioAnterior(pg), zonas: zonasEn(pg, ZONA_SIEMBRA),
    } } };
  }
  // TRIGO condición
  const pt = parDe(/trigo/i);
  const tc = pt.match(rx(N + String.raw`\s?% del área presenta condición de cultivo entre Normal a Excelente`))
    || pt.match(rx(String.raw`condición de cultivo Normal (?:a|\/) Excelente en el ` + N + String.raw`\s?%`));
  if (tc) cultivos.trigo = { metricas: { condicion: { categoria: "Normal a Excelente", nacional: num(tc[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };
  // CEBADA condición
  const pc = parDe(/cebada/i);
  const cb = pc.match(rx(N + String.raw`\s?% bajo una condición de cultivo (Normal a Buena|Normal a Excelente)`));
  if (cb) cultivos.cebada = { metricas: { condicion: { categoria: cb[2], nacional: num(cb[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };
  // SOJA siembra (sólo con número explícito)
  const sj = cuerpo.match(/siembra de soja[^.]*?(?:alcanza|cubre) el (\d+(?:,\d+)?)\s?%/i);
  if (sj) cultivos.soja = { metricas: { siembra: { nacional: num(sj[1]), varSemanalPp: null, vsAnioAnteriorPp: null, zonas: {} } } };

  return { fecha, relevamientoAl, cultivos };
}
