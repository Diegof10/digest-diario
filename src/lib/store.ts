import { promises as fs } from "fs";
import path from "path";
import type { StoredState } from "./diff";

export type WatchItem = {
  cuit: string;
  label?: string;
  mailTo?: string | null;
};

export type WatchlistFile = {
  cuits: WatchItem[];
  updatedAt: string | null;
  source?: string;
};

const DATA = path.join(process.cwd(), "data");
const WATCH = path.join(DATA, "watchlist.json");
const STATE = path.join(DATA, "last-state.json");
const BLOB_WATCH = "alerta-sisa/watchlist.json";
const BLOB_STATE = "alerta-sisa/last-state.json";

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureDataDir() {
  await fs.mkdir(DATA, { recursive: true });
}

async function readJsonFs<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFs(file: string, data: unknown) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: pathname });
  const hit = blobs.find((b) => b.pathname === pathname);
  if (!hit) return fallback;
  const res = await fetch(hit.url, { cache: "no-store" });
  if (!res.ok) return fallback;
  return (await res.json()) as T;
}

async function writeJsonBlob(pathname: string, data: unknown) {
  const { put } = await import("@vercel/blob");
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function loadWatchlist(): Promise<WatchItem[]> {
  const empty: WatchlistFile = { cuits: [], updatedAt: null };
  if (hasBlob()) {
    const j = await readJsonBlob<WatchlistFile>(BLOB_WATCH, empty);
    return j.cuits || [];
  }
  // migrate from legacy src/data if present
  const legacy = path.join(process.cwd(), "src", "data", "watchlist.json");
  const j = await readJsonFs<WatchlistFile>(WATCH, empty);
  if ((j.cuits || []).length === 0) {
    const leg = await readJsonFs<WatchlistFile>(legacy, empty);
    if ((leg.cuits || []).length > 0) return leg.cuits || [];
  }
  return j.cuits || [];
}

export async function saveWatchlist(
  cuits: WatchItem[],
  source = "csv"
): Promise<WatchlistFile> {
  const payload: WatchlistFile = {
    cuits,
    updatedAt: new Date().toISOString(),
    source,
  };
  if (hasBlob()) {
    await writeJsonBlob(BLOB_WATCH, payload);
  } else {
    await writeJsonFs(WATCH, payload);
  }
  return payload;
}

export async function loadLastState(): Promise<Record<string, StoredState>> {
  if (hasBlob()) {
    return readJsonBlob<Record<string, StoredState>>(BLOB_STATE, {});
  }
  return readJsonFs<Record<string, StoredState>>(STATE, {});
}

export async function saveLastState(state: Record<string, StoredState>) {
  if (hasBlob()) {
    await writeJsonBlob(BLOB_STATE, state);
  } else {
    await writeJsonFs(STATE, state);
  }
}

export function persistenceMode(): "blob" | "filesystem" {
  return hasBlob() ? "blob" : "filesystem";
}
