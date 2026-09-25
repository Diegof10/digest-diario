#!/usr/bin/env node
/**
 * Actualiza src/data/avance-bcba.json con el último Panorama Agrícola Semanal (BCBA).
 * Pensado para correr los jueves (tarde, ART). Requiere pdftotext/pdfinfo (poppler-utils).
 *
 *   node scripts/update-avance-bcba.mjs              # intenta bajar el último PAS
 *   node scripts/update-avance-bcba.mjs --pdf x.pdf  # parsea un PDF bajado a mano
 *
 * Fuentes en orden: 1) bolsadecereales.com/estimaciones-informes (hoy: 403 Cloudflare a bots)
 *                   2) copia pública del PDF (casaresonline.com.ar, API de medios de WordPress)
 * Si todo falla: NO toca los informes; sólo registra estadoDescarga {ok:false}. La UI marca
 * "viejo" si el último informe tiene más de 8 días.
 * Nunca estima: lo que el parser no encuentra queda null / sin zona.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "fs";
import { execFileSync } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { parsePas } from "./pas/parse-pas.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "avance-bcba.json");
const OFICIAL = "https://www.bolsadecereales.com/estimaciones-informes";
const UA = "Mozilla/5.0 (resumen-agrario; +https://resumen-agrario.vercel.app)";

async function candidatos() {
  const out = [];
  try {
    const r = await fetch(OFICIAL, { headers: { "User-Agent": UA } });
    const html = await r.text();
    if (r.ok && !/Just a moment|challenge-platform/.test(html)) {
      const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => new URL(m[1], OFICIAL).href).filter((u) => /pas/i.test(u));
      if (links[0]) out.push({ url: links[0], via: "oficial", publicado: r.headers.get("last-modified") });
    } else out.push({ error: `oficial HTTP ${r.status}${/challenge/.test(html) ? " (Cloudflare)" : ""}` });
  } catch (e) { out.push({ error: `oficial: ${e.message}` }); }
  try {
    const r = await fetch("https://casaresonline.com.ar/wp-json/wp/v2/media?search=PAS&per_page=10&orderby=date", { headers: { "User-Agent": UA } });
    const items = (await r.json()).filter((x) => /PAS-\d{4}-\d{2}-\d{2}.*\.pdf$/i.test(x.source_url));
    if (items[0]) out.push({ url: items[0].source_url, via: "copia", publicado: items[0].date });
  } catch (e) { out.push({ error: `copia: ${e.message}` }); }
  return out;
}

function pdfATexto(file) {
  const txt = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  let creado = null;
  try {
    const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const m = info.match(/CreationDate:\s+(.+)/);
    if (m) creado = new Date(m[1].trim()).toISOString();
  } catch {}
  return { txt, creado };
}

function aInforme(parsed, meta) {
  const cultivos = {};
  for (const [k, v] of Object.entries(parsed.cultivos)) cultivos[k] = v;
  if (!cultivos.soja) cultivos.soja = { sinAvance: true, metricas: {} };
  return {
    fecha: parsed.fecha,
    relevamientoAl: parsed.relevamientoAl,
    origen: "pdf",
    origenNota: meta.via === "oficial" ? "PDF oficial del PAS." : "PDF del PAS (copia pública del archivo de la BCBA). Zonas: sólo cifras por zona dadas con número en el texto.",
    publicado: { iso: meta.creado, texto: meta.creado ? `creación del PDF ${meta.creado}` : "hora s/d" },
    urlInforme: OFICIAL,
    respaldo: meta.url ? [meta.url] : [],
    cultivos,
  };
}

async function main() {
  const data = JSON.parse(readFileSync(OUT, "utf8"));
  const arg = process.argv.indexOf("--pdf");
  const errores = [];
  let informe = null;
  const tryPdf = (file, meta) => {
    const { txt, creado } = pdfATexto(file);
    const p = parsePas(txt);
    if (!p.fecha || !Object.keys(p.cultivos).length) throw new Error("parser sin datos");
    return aInforme(p, { ...meta, creado });
  };
  if (arg > 0) informe = tryPdf(process.argv[arg + 1], { via: "manual" });
  else {
    for (const c of await candidatos()) {
      if (c.error) { errores.push(c.error); continue; }
      try {
        const r = await fetch(c.url, { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const f = path.join(mkdtempSync(path.join(os.tmpdir(), "pas-")), "pas.pdf");
        writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        informe = tryPdf(f, c);
        break;
      } catch (e) { errores.push(`${c.via}: ${e.message}`); }
    }
  }
  const ahora = new Date().toISOString();
  if (informe && informe.fecha > (data.informes[0]?.fecha ?? "")) {
    data.informes = [informe, ...data.informes].slice(0, 4);
    data.estadoDescarga = { ok: true, intentoISO: ahora, detalle: `informe ${informe.fecha} (${informe.respaldo[0] ?? "manual"})` };
  } else {
    data.estadoDescarga = { ok: false, intentoISO: ahora, detalle: informe ? `sin informe nuevo (último ${data.informes[0]?.fecha})` : errores.join(" | ") || "sin candidatos" };
  }
  writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify(data.estadoDescarga));
}
main().catch((e) => { console.error(e); process.exit(1); });
