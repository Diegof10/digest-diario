import { promises as fs } from "fs";
import path from "path";
import type { StoredState } from "./diff";

export type WatchItem = {
  cuit: string;
  label?: string;
  mailTo?: string | null;
};

const DATA = path.join(process.cwd(), "src", "data");
const WATCH = path.join(DATA, "watchlist.json");
const STATE = path.join(DATA, "last-state.json");

async function ensureDataDir() {
  await fs.mkdir(DATA, { recursive: true });
}

export async function loadWatchlist(): Promise<WatchItem[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(WATCH, "utf8");
    const j = JSON.parse(raw) as { cuits?: WatchItem[] };
    return j.cuits || [];
  } catch {
    return [];
  }
}

export async function loadLastState(): Promise<Record<string, StoredState>> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STATE, "utf8");
    return JSON.parse(raw) as Record<string, StoredState>;
  } catch {
    // bootstrap from fixture if present
    try {
      const raw = await fs.readFile(
        path.join(DATA, "last-state.fixture.json"),
        "utf8"
      );
      return JSON.parse(raw) as Record<string, StoredState>;
    } catch {
      return {};
    }
  }
}

export async function saveLastState(state: Record<string, StoredState>) {
  await ensureDataDir();
  await fs.writeFile(STATE, JSON.stringify(state, null, 2), "utf8");
}
