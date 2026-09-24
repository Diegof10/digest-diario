#!/usr/bin/env node
/**
 * Refresh digest Noticias snapshot (X / agro).
 *
 * Usage:
 *   node scripts/refresh-noticias.mjs                 # validate + print status
 *   node scripts/refresh-noticias.mjs --empty          # clear items (VACÍO)
 *   node scripts/refresh-noticias.mjs --from path.json # merge items/valor from file
 *   echo '{...}' | node scripts/refresh-noticias.mjs --stdin
 *
 * Rules: never invent likes/views. Omit or set null. If no fresh posts → empty items.
 * Routine "Noticias X diario digest" @ 07:00 ARG should call this after gathering posts.
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SNAP = path.join(ROOT, "src", "data", "noticias-snapshot.json");
const VALOR_MAX = 280;

function nowArgParts() {
  const d = new Date();
  const asOf = d.toISOString();
  const asOfArg = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { asOf, asOfArg };
}

function clip(s) {
  const t = String(s).trim();
  return t.length <= VALOR_MAX ? t : t.slice(0, VALOR_MAX - 1) + "…";
}

function buildValor(items) {
  if (!items?.length) return null;
  const lines = items.slice(0, 5).map((it) => {
    const h = String(it.handle || "").replace(/^@/, "");
    const text = String(it.text || "").trim();
    const snip = text.length > 90 ? text.slice(0, 87).trimEnd() + "…" : text;
    return `• ${snip} (@${h})`;
  });
  return clip(lines.join(" "));
}

function load() {
  return JSON.parse(readFileSync(SNAP, "utf8"));
}

function save(data) {
  writeFileSync(SNAP, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function usage() {
  console.log(`Usage:
  node scripts/refresh-noticias.mjs [--empty | --from FILE | --stdin] [--valor TEXT] [--note TEXT]
`);
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  usage();
  process.exit(0);
}

const cur = load();
const { asOf, asOfArg } = nowArgParts();
let patch = null;

if (args.includes("--empty")) {
  patch = { items: [], valor: null, note: cur.note || "Vacío a pedido — sin posts frescos." };
} else if (args.includes("--from")) {
  const i = args.indexOf("--from");
  const fp = args[i + 1];
  if (!fp) {
    console.error("--from requires path");
    process.exit(1);
  }
  patch = JSON.parse(readFileSync(fp, "utf8"));
} else if (args.includes("--stdin")) {
  const raw = readFileSync(0, "utf8");
  patch = JSON.parse(raw);
} else if (args.length === 0) {
  const ageH = cur.asOf
    ? (Date.now() - Date.parse(cur.asOf)) / 3_600_000
    : null;
  console.log(
    JSON.stringify(
      {
        path: SNAP,
        asOf: cur.asOf,
        asOfArg: cur.asOfArg,
        items: cur.items?.length ?? 0,
        valorLen: cur.valor?.length ?? 0,
        ageHours: ageH != null && Number.isFinite(ageH) ? +ageH.toFixed(2) : null,
        maxAgeHours: cur.maxAgeHours ?? 48,
        stale:
          ageH != null &&
          Number.isFinite(ageH) &&
          ageH > (cur.maxAgeHours ?? 48),
        empty: !(cur.items && cur.items.length),
      },
      null,
      2,
    ),
  );
  process.exit(0);
} else {
  usage();
  process.exit(1);
}

const items = Array.isArray(patch.items) ? patch.items : [];
// sanitize metrics — never coerce missing to numbers
const cleanItems = items.map((it) => ({
  handle: String(it.handle || "").replace(/^@/, ""),
  text: String(it.text || "").trim(),
  url: it.url ?? null,
  likes: typeof it.likes === "number" ? it.likes : null,
  views: typeof it.views === "number" ? it.views : null,
  reposts: typeof it.reposts === "number" ? it.reposts : null,
  publishedAt: it.publishedAt ?? null,
  publishedAtArg: it.publishedAtArg ?? null,
  metricsUnavailable:
    it.metricsUnavailable === true ||
    (it.likes == null && it.views == null && it.reposts == null),
  relevance: typeof it.relevance === "number" ? it.relevance : null,
})).filter((it) => it.handle && it.text);

const vi = args.indexOf("--valor");
const ni = args.indexOf("--note");
const valorArg = vi >= 0 ? args[vi + 1] : null;
const noteArg = ni >= 0 ? args[ni + 1] : null;

const next = {
  ...cur,
  ...patch,
  accounts: patch.accounts ?? cur.accounts,
  maxAgeHours: patch.maxAgeHours ?? cur.maxAgeHours ?? 48,
  items: cleanItems,
  valor:
    valorArg != null
      ? clip(valorArg)
      : patch.valor != null
        ? clip(patch.valor)
        : buildValor(cleanItems),
  note:
    noteArg ??
    patch.note ??
    (cleanItems.length
      ? `Refresh ${asOfArg} · ${cleanItems.length} items`
      : "Sin posts frescos — celda VACÍO"),
  asOf: cleanItems.length ? asOf : null,
  asOfArg: cleanItems.length ? asOfArg : null,
  updatedAt: asOf,
  updatedBy: "scripts/refresh-noticias.mjs",
};

save(next);
console.log(
  JSON.stringify(
    {
      ok: true,
      wrote: SNAP,
      items: next.items.length,
      valor: next.valor,
      asOf: next.asOf,
      asOfArg: next.asOfArg,
    },
    null,
    2,
  ),
);
