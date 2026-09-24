#!/usr/bin/env node
/**
 * Fetch recent agro posts from X API and write noticias-snapshot.json.
 *
 * Loads bearer from process.env.X_BEARER_TOKEN or
 * /home/box/agent-data/box-secrets.json → card.X_BEARER_TOKEN.
 * NEVER logs or prints the token.
 *
 * Usage: node scripts/fetch-noticias-x.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SNAP = path.join(ROOT, "src", "data", "noticias-snapshot.json");
const SECRETS = "/home/box/agent-data/box-secrets.json";
const MAX_AGE_H = 48;
const VALOR_MAX = 280;
const TOP_N = 5;
const TWEETS_PER_USER = 5;

const HOSTS = ["https://api.x.com", "https://api.twitter.com"];

const DEFAULT_ACCOUNTS = [
  { handle: "BCRmercados", focus: "local", why: "Análisis BCR granos, pizarra, exportaciones" },
  { handle: "BolsaRosario", focus: "local", why: "Cuenta institucional BCR" },
  { handle: "a3mercados", focus: "local", why: "Futuros/opciones agro A3 (ex Matba-Rofex)" },
  { handle: "Bolsadecereales", focus: "local", why: "Bolsa de Cereales BA — estimaciones/GEA" },
  { handle: "infocampoweb", focus: "local", why: "Periodismo agro AR, precios Rosario" },
  { handle: "BichosdeCampo", focus: "local", why: "Agro periodismo/análisis de campo" },
  { handle: "AgrofyNews", focus: "local", why: "Portal agro noticias LATAM" },
  { handle: "kannbwx", focus: "intl", why: "Karen Braun — granos globales, charts USDA" },
  { handle: "USDA_AMS", focus: "intl", why: "USDA AMS market news / export sales" },
  { handle: "USDAForeignAg", focus: "intl", why: "FAS GAIN / trade attachés" },
  { handle: "AgWeb", focus: "intl", why: "AgWeb Editors — CBOT commentary US" },
  { handle: "Reuters", focus: "intl", why: "Reuters agri/commodities (filtrar grain)" },
];

function loadBearer() {
  if (process.env.X_BEARER_TOKEN && String(process.env.X_BEARER_TOKEN).trim()) {
    return String(process.env.X_BEARER_TOKEN).trim();
  }
  try {
    const raw = JSON.parse(readFileSync(SECRETS, "utf8"));
    const t = raw?.card?.X_BEARER_TOKEN;
    if (t && String(t).trim()) return String(t).trim();
  } catch {
    // ignore
  }
  return null;
}

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

function formatArg(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Cordoba",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function clip(s) {
  const t = String(s).trim();
  return t.length <= VALOR_MAX ? t : t.slice(0, VALOR_MAX - 1) + "…";
}

function loadSnap() {
  try {
    return JSON.parse(readFileSync(SNAP, "utf8"));
  } catch {
    return { accounts: DEFAULT_ACCOUNTS, maxAgeHours: MAX_AGE_H };
  }
}

function saveSnap(data) {
  writeFileSync(SNAP, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Safe status-only fetch; never logs Authorization or body on 401/403. */
async function apiGet(host, pathAndQuery, bearer) {
  const url = `${host}${pathAndQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
      "User-Agent": "digest-diario-noticias/1.0",
    },
  });
  const status = res.status;
  if (status === 401 || status === 403) {
    return { ok: false, status, data: null, rateLimited: false, authError: true };
  }
  if (status === 429) {
    return { ok: false, status, data: null, rateLimited: true, authError: false };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    // Avoid echoing error bodies that might contain auth hints
    return { ok: false, status, data: null, rateLimited: false, authError: false };
  }
  return { ok: true, status, data, rateLimited: false, authError: false };
}

async function apiGetWithFallback(pathAndQuery, bearer) {
  let last = null;
  for (const host of HOSTS) {
    try {
      const r = await apiGet(host, pathAndQuery, bearer);
      last = { ...r, host };
      if (r.ok) return last;
      // Try alternate host on any failure (including 401/403/429 from first host)
      continue;
    } catch (e) {
      last = {
        ok: false,
        status: 0,
        data: null,
        rateLimited: false,
        authError: false,
        host,
        netError: e?.message || "network",
      };
    }
  }
  return last || { ok: false, status: 0, data: null, rateLimited: false, authError: false };
}

function scoreTweet(pm) {
  if (!pm || typeof pm !== "object") return 0;
  const likes = typeof pm.like_count === "number" ? pm.like_count : 0;
  const views = typeof pm.impression_count === "number" ? pm.impression_count : 0;
  return likes + views;
}

function withinHours(iso, hours) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 3_600_000;
}

function buildValor(items) {
  if (!items?.length) return null;
  const lines = items.slice(0, TOP_N).map((it) => {
    const h = String(it.handle || "").replace(/^@/, "");
    const text = String(it.text || "").trim().replace(/\s+/g, " ");
    const snip = text.length > 90 ? text.slice(0, 87).trimEnd() + "…" : text;
    const likesPart =
      typeof it.likes === "number" ? ` · ${it.likes} likes` : "";
    return `• ${snip} (@${h}${likesPart})`;
  });
  return clip(lines.join(" "));
}

async function main() {
  const bearer = loadBearer();
  const cur = loadSnap();
  const accounts = Array.isArray(cur.accounts) && cur.accounts.length
    ? cur.accounts
    : DEFAULT_ACCOUNTS;
  const { asOf, asOfArg } = nowArgParts();

  if (!bearer) {
    const next = {
      ...cur,
      accounts,
      maxAgeHours: cur.maxAgeHours ?? MAX_AGE_H,
      items: [],
      valor: null,
      asOf: null,
      asOfArg: null,
      note: "Sin X_BEARER_TOKEN (env ni box-secrets card) — no se inventan posts.",
      updatedAt: asOf,
      updatedBy: "scripts/fetch-noticias-x.mjs",
      fuente: "X API",
    };
    saveSnap(next);
    console.log(JSON.stringify({ ok: false, reason: "missing_bearer", items: 0 }, null, 2));
    process.exit(1);
  }

  const errors = [];
  const collected = [];
  let rateLimited = false;
  let authError = false;
  let hostUsed = null;

  for (const acc of accounts) {
    const username = String(acc.handle || "").replace(/^@/, "").trim();
    if (!username) continue;

    const userRes = await apiGetWithFallback(
      `/2/users/by/username/${encodeURIComponent(username)}`,
      bearer,
    );
    if (userRes.host) hostUsed = userRes.host;
    if (userRes.authError) {
      authError = true;
      errors.push({ step: "user", username, status: userRes.status });
      break;
    }
    if (userRes.rateLimited) {
      rateLimited = true;
      errors.push({ step: "user", username, status: 429 });
      break;
    }
    if (!userRes.ok || !userRes.data?.data?.id) {
      errors.push({
        step: "user",
        username,
        status: userRes.status || 0,
        missing: !userRes.data?.data?.id,
      });
      continue;
    }

    const userId = userRes.data.data.id;
    const tweetsPath =
      `/2/users/${encodeURIComponent(userId)}/tweets` +
      `?max_results=${TWEETS_PER_USER}` +
      `&tweet.fields=created_at,public_metrics,text` +
      `&exclude=retweets,replies`;

    const twRes = await apiGetWithFallback(tweetsPath, bearer);
    if (twRes.host) hostUsed = twRes.host;
    if (twRes.authError) {
      authError = true;
      errors.push({ step: "tweets", username, status: twRes.status });
      break;
    }
    if (twRes.rateLimited) {
      rateLimited = true;
      errors.push({ step: "tweets", username, status: 429 });
      break;
    }
    if (!twRes.ok) {
      errors.push({ step: "tweets", username, status: twRes.status || 0 });
      continue;
    }

    const tweets = Array.isArray(twRes.data?.data) ? twRes.data.data : [];
    for (const tw of tweets) {
      if (!tw?.text || !tw?.id) continue;
      if (!withinHours(tw.created_at, MAX_AGE_H)) continue;
      const pm = tw.public_metrics || {};
      const likes = typeof pm.like_count === "number" ? pm.like_count : null;
      const views =
        typeof pm.impression_count === "number" ? pm.impression_count : null;
      const reposts =
        typeof pm.retweet_count === "number" ? pm.retweet_count : null;
      const metricsUnavailable = likes == null && views == null && reposts == null;
      collected.push({
        handle: username,
        text: String(tw.text).trim(),
        url: `https://x.com/${username}/status/${tw.id}`,
        likes,
        views,
        reposts,
        publishedAt: tw.created_at || null,
        publishedAtArg: formatArg(tw.created_at),
        metricsUnavailable,
        relevance: scoreTweet(pm),
        _score: scoreTweet(pm),
      });
    }

    // gentle pacing to reduce 429 risk
    await new Promise((r) => setTimeout(r, 200));
  }

  collected.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const ta = Date.parse(a.publishedAt || "") || 0;
    const tb = Date.parse(b.publishedAt || "") || 0;
    return tb - ta;
  });

  const top = collected.slice(0, TOP_N).map(({ _score, ...rest }) => rest);

  const firstErrStatus = errors[0]?.status;
  let note;
  if (authError) {
    note = `X API HTTP ${firstErrStatus ?? "401/403"} (api.x.com + api.twitter.com) — sin posts. No se inventan likes. ${asOfArg}. fuente=X API`;
  } else if (rateLimited && top.length === 0) {
    note = `X API rate limit (429) — sin posts frescos. ${asOfArg}. fuente=X API`;
  } else if (top.length === 0) {
    note = `Sin posts X en últimas ${MAX_AGE_H}h con métricas verificables. fuente=X API. ${asOfArg}`;
  } else {
    note = `Refresh X API ${asOfArg} · ${top.length} items · host=${hostUsed || "api.x.com"} · fuente=X API`;
  }

  const next = {
    ...cur,
    accounts,
    maxAgeHours: cur.maxAgeHours ?? MAX_AGE_H,
    items: top,
    valor: buildValor(top),
    asOf: top.length ? asOf : null,
    asOfArg: top.length ? asOfArg : null,
    note,
    updatedAt: asOf,
    updatedBy: "scripts/fetch-noticias-x.mjs",
    fuente: "X API",
  };
  saveSnap(next);

  // Report to stdout — never token, never auth bodies
  const summary = {
    ok: top.length > 0,
    items: top.length,
    collected: collected.length,
    rateLimited,
    authError,
    hostUsed,
    asOf: next.asOf,
    asOfArg: next.asOfArg,
    valor: next.valor,
    note: next.note,
    errorStatuses: errors.map((e) => ({
      step: e.step,
      username: e.username,
      status: e.status,
    })),
    top: top.map((it) => ({
      handle: it.handle,
      likes: it.likes,
      views: it.views,
      publishedAtArg: it.publishedAtArg,
      text: it.text.length > 120 ? it.text.slice(0, 117) + "…" : it.text,
      url: it.url,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(top.length || (!authError && !rateLimited) ? 0 : 1);
}

main().catch((err) => {
  // Never include headers/token in error output
  console.error(JSON.stringify({ ok: false, fatal: String(err?.message || err) }));
  process.exit(1);
});
