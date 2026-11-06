/**
 * Clima en vivo (tope de la home): Buenos Aires, Santa Fe (ciudad) y Córdoba (ciudad).
 * Fuente: Open-Meteo (api.open-meteo.com, `current`, sin clave). Es salida de modelo,
 * no lectura de estación → se rotula "Open-Meteo (modelo)".
 * (SMN ws.smn.gob.ar responde 503 a pedidos automáticos, por eso no se usa.)
 *
 * La home no se queda con el `climaVivo` congelado en `digest/latest.json`: si ese
 * snapshot no está vigente, esta lectura consulta Open-Meteo de nuevo (`cache: no-store`,
 * timeout 15s). Un fallo del digest no fija "sin dato" hasta el cron siguiente.
 * Si la lectura nueva falla y el último valor real tiene menos de 2 h, se muestra como
 * último valor (no como dato actual). Si no hay valor vigente, "sin dato". Nunca se inventa.
 * Hora mostrada = `current.time` del propio dato (ART).
 */

export const CLIMA_VIVO_FUENTE = "Open-Meteo (modelo)";
export const CLIMA_VIVO_URL = "https://open-meteo.com/";
/** Más holgado que los 8s que abortaban la lectura dentro del cron del digest. */
export const CLIMA_VIVO_TIMEOUT_MS = 15_000;
/** Snapshot con datos vigentes y lectura reciente: no vuelve a pegarle a Open-Meteo. */
export const CLIMA_VIVO_CACHE_OK_MS = 10 * 60_000;
/** Un fallo no se reintenta en cada visita de la misma instancia, pero tampoco queda horas. */
export const CLIMA_VIVO_CACHE_FALLO_MS = 2 * 60_000;
export const CLIMA_VIVO_MAX_EDAD_MS = 2 * 3600_000;

const CIUDADES = [
  { id: "caba", nombre: "Buenos Aires", lat: -34.61, lon: -58.38 },
  { id: "santafe", nombre: "Santa Fe", lat: -31.63, lon: -60.7 },
  { id: "cordoba", nombre: "Córdoba", lat: -31.42, lon: -64.18 },
] as const;

const UA =
  "Mozilla/5.0 (compatible; digest-diario/0.2; +https://github.com/Diegof10/digest-diario) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface ClimaCiudad {
  id: string;
  nombre: string;
  tempC: number | null;
  condicion: string | null;
  /** weather_code WMO (sólo para elegir el ícono) */
  code: number | null;
  vientoKmh: number | null;
  vientoDir: string | null;
  /** current.time de Open-Meteo, hora local ART "yyyy-mm-ddThh:mm" */
  horaDato: string | null;
  error: string | null;
}

export type EstadoClimaVivo = "ok" | "stale" | "sin_dato";

export interface ClimaVivoSnapshot {
  fuente: string;
  url: string;
  ciudades: ClimaCiudad[];
  leidoAt: string;
  /**
   * ok = lectura nueva con dato vigente.
   * stale = la lectura nueva falló; los números son el último valor real (menos de 2 h).
   * sin_dato = no hay número vigente para mostrar.
   * Ausente en snapshots viejos del blob: se infiere.
   */
  estado?: EstadoClimaVivo;
  /** Por qué falló la última lectura en vivo, si estado no es ok. */
  errorLectura?: string | null;
  /** ISO de la lectura que produjo los números, cuando estado es stale. */
  datoLeidoAt?: string | null;
}

export interface ClimaVivoResumen {
  leidoAt: string | null;
  estado: EstadoClimaVivo | "ausente";
  errorLectura: string | null;
  conDato: number;
  errores: string[];
  ciudades: Array<{
    id: string;
    nombre: string;
    conDato: boolean;
    tempC: number | null;
    horaDato: string | null;
    error: string | null;
  }>;
  nota: string;
}

type ClimaFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClimaVivoOpts {
  fetchImpl?: ClimaFetch;
  now?: Date;
  timeoutMs?: number;
  /** El cron no reutiliza un fallo cacheado en la misma instancia. */
  bypassCache?: boolean;
}

/** Códigos WMO → condición en castellano. */
function condicionWmo(code: number | null | undefined): string | null {
  if (code == null) return null;
  if (code === 0) return "despejado";
  if (code === 1) return "mayormente despejado";
  if (code === 2) return "parcialmente nublado";
  if (code === 3) return "nublado";
  if (code === 45 || code === 48) return "niebla";
  if (code >= 51 && code <= 57) return "llovizna";
  if (code >= 61 && code <= 67) return "lluvia";
  if (code >= 71 && code <= 77) return "nieve";
  if (code >= 80 && code <= 82) return "chaparrones";
  if (code === 85 || code === 86) return "chaparrones de nieve";
  if (code >= 95) return "tormenta";
  return null;
}

function dirCardinal(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** "yyyy-mm-ddThh:mm" ART → epoch ms. null si no parsea. */
export function parseHoraArt(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}:00-03:00`);
  return Number.isFinite(t) ? t : null;
}

function corto(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

export function horaLecturaArt(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

function horaDe(local: string | null | undefined): string | null {
  return local?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
}

export function estadoClimaVivo(clima: ClimaVivoSnapshot | null | undefined): EstadoClimaVivo {
  if (!clima) return "sin_dato";
  if (clima.estado === "ok" || clima.estado === "stale" || clima.estado === "sin_dato") return clima.estado;
  return clima.ciudades.some((c) => c.tempC != null && !c.error) ? "ok" : "sin_dato";
}

function ciudadVacia(c: { id: string; nombre: string }, error: string): ClimaCiudad {
  return {
    id: c.id,
    nombre: c.nombre,
    tempC: null,
    condicion: null,
    code: null,
    vientoKmh: null,
    vientoDir: null,
    horaDato: null,
    error,
  };
}

/** Dato real, con hora ART parseable y menos de 2 h (o hasta 30 min en el futuro). */
export function ciudadVigente(c: ClimaCiudad, now: Date): boolean {
  if (c.error || c.tempC == null || !Number.isFinite(c.tempC)) return false;
  const t = parseHoraArt(c.horaDato);
  if (t == null) return false;
  const edad = now.getTime() - t;
  return edad <= CLIMA_VIVO_MAX_EDAD_MS && edad >= -30 * 60_000;
}

function logClima(level: "error" | "warn", event: string, fields: Record<string, string | number | null>) {
  const line = `[clima-vivo] ${event} ${JSON.stringify(fields)}`;
  if (level === "error") console.error(line);
  else console.warn(line);
}

function kindDe(error: string): string {
  if (error.startsWith("timeout")) return "timeout";
  if (error.startsWith("HTTP ")) return "http";
  if (error === "respuesta no es JSON") return "parse";
  if (error === "dato de más de 2 h") return "viejo";
  if (error === "respuesta sin dato") return "incompleto";
  return "red";
}

type OmCurrent = {
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  reason?: string;
  error?: boolean;
};

export function urlClimaVivo(): string {
  const qs = new URLSearchParams({
    latitude: CIUDADES.map((c) => c.lat).join(","),
    longitude: CIUDADES.map((c) => c.lon).join(","),
    current: "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m",
    timezone: "America/Argentina/Buenos_Aires",
    wind_speed_unit: "kmh",
  });
  return `https://api.open-meteo.com/v1/forecast?${qs}`;
}

function cerrar(ciudades: ClimaCiudad[], leidoAt: string, now: Date): ClimaVivoSnapshot {
  const ok = ciudades.some((c) => ciudadVigente(c, now));
  const errorLectura = ok ? null : corto(ciudades.find((c) => c.error)?.error ?? "sin dato");
  return {
    fuente: CLIMA_VIVO_FUENTE,
    url: CLIMA_VIVO_URL,
    ciudades,
    leidoAt,
    estado: ok ? "ok" : "sin_dato",
    errorLectura,
    datoLeidoAt: ok ? leidoAt : null,
  };
}

/** Arma el snapshot a partir del JSON de Open-Meteo. No inventa temperaturas. */
export function interpretarClimaVivo(data: unknown, now: Date, leidoAt: string): ClimaVivoSnapshot {
  const filas = Array.isArray(data) ? data : [data];
  const ciudades = CIUDADES.map((c, i): ClimaCiudad => {
    const cur = (filas[i] as OmCurrent | undefined)?.current;
    const temp = cur?.temperature_2m;
    const time = typeof cur?.time === "string" ? cur.time : null;
    const base = { id: c.id, nombre: c.nombre, horaDato: time };
    if (typeof temp !== "number" || !Number.isFinite(temp) || !time) {
      return { ...base, tempC: null, condicion: null, code: null, vientoKmh: null, vientoDir: null, error: "respuesta sin dato" };
    }
    const t = parseHoraArt(time);
    const edad = t == null ? null : now.getTime() - t;
    if (edad == null || edad > CLIMA_VIVO_MAX_EDAD_MS || edad < -30 * 60_000) {
      return { ...base, tempC: null, condicion: null, code: null, vientoKmh: null, vientoDir: null, error: "dato de más de 2 h" };
    }
    return {
      ...base,
      tempC: temp,
      condicion: condicionWmo(cur?.weather_code),
      code: typeof cur?.weather_code === "number" ? cur.weather_code : null,
      vientoKmh: typeof cur?.wind_speed_10m === "number" ? cur.wind_speed_10m : null,
      vientoDir: dirCardinal(cur?.wind_direction_10m),
      error: null,
    };
  });
  return cerrar(ciudades, leidoAt, now);
}

function fallo(error: string, leidoAt: string, now: Date): ClimaVivoSnapshot {
  return cerrar(
    CIUDADES.map((c) => ciudadVacia(c, error)),
    leidoAt,
    now,
  );
}

/**
 * Si la lectura nueva no sirve y el snapshot anterior todavía tiene números de menos de 2 h,
 * se conservan rotulados como último valor. Si no, sin dato. Nunca se copian números viejos.
 */
export function respaldoClimaVivo(
  prev: ClimaVivoSnapshot | null | undefined,
  failed: ClimaVivoSnapshot,
  now: Date,
): ClimaVivoSnapshot {
  const errorLectura = corto(failed.errorLectura || failed.ciudades.find((c) => c.error)?.error || "sin dato");
  const vigentes = (prev?.ciudades ?? []).filter((c) => ciudadVigente(c, now));
  if (vigentes.length === 0) {
    logClima("warn", "sin_respaldo", { error: errorLectura, leidoAt: failed.leidoAt });
    return {
      ...failed,
      estado: "sin_dato",
      errorLectura,
      datoLeidoAt: null,
      ciudades: failed.ciudades.map((c) => ({
        ...c,
        tempC: null,
        condicion: null,
        code: null,
        vientoKmh: null,
        vientoDir: null,
      })),
    };
  }
  const datoLeidoAt = prev?.estado === "stale" && prev.datoLeidoAt ? prev.datoLeidoAt : (prev?.leidoAt ?? null);
  logClima("warn", "respaldo_ultimo_valor", { error: errorLectura, datoLeidoAt, leidoAt: failed.leidoAt });
  const byId = new Map(vigentes.map((c) => [c.id, c]));
  return {
    fuente: CLIMA_VIVO_FUENTE,
    url: CLIMA_VIVO_URL,
    leidoAt: failed.leidoAt,
    datoLeidoAt,
    estado: "stale",
    errorLectura,
    ciudades: CIUDADES.map((c) => {
      const g = byId.get(c.id);
      return g ? { ...g, error: null } : ciudadVacia(c, "sin dato en el último valor");
    }),
  };
}

/** Al persistir el digest: un fallo no pisa un último valor vigente, ni lo marca como lectura nueva. */
export function mergeClimaPersistido(
  prev: ClimaVivoSnapshot | null | undefined,
  next: ClimaVivoSnapshot,
  now = new Date(),
): ClimaVivoSnapshot {
  if (next.estado === "ok" && next.ciudades.some((c) => ciudadVigente(c, now))) {
    if (next.errorLectura == null && next.datoLeidoAt === next.leidoAt) return next;
    return { ...next, estado: "ok", errorLectura: null, datoLeidoAt: next.leidoAt };
  }
  return respaldoClimaVivo(prev, next, now);
}

/** true si el snapshot guardado alcanza para no consultar la red. */
export function climaVivoSirveDeCache(snap: ClimaVivoSnapshot | null | undefined, now: Date): boolean {
  if (!snap) return false;
  if (snap.estado === "stale" || snap.estado === "sin_dato" || snap.errorLectura) return false;
  const leido = Date.parse(snap.leidoAt);
  if (!Number.isFinite(leido)) return false;
  const age = now.getTime() - leido;
  if (age > CLIMA_VIVO_CACHE_OK_MS || age < -60_000) return false;
  return snap.ciudades.some((c) => ciudadVigente(c, now));
}

export function resumenClimaVivo(snap: ClimaVivoSnapshot | null | undefined): ClimaVivoResumen {
  if (!snap) {
    return {
      leidoAt: null,
      estado: "ausente",
      errorLectura: null,
      conDato: 0,
      errores: [],
      ciudades: [],
      nota: "Sin snapshot de clima ahora en el digest. La home consulta Open-Meteo al vuelo.",
    };
  }
  const estado = estadoClimaVivo(snap);
  const errores = [...new Set(snap.ciudades.map((c) => c.error).filter((e): e is string => Boolean(e)))];
  return {
    leidoAt: snap.leidoAt,
    estado,
    errorLectura: snap.errorLectura ?? (estado === "ok" ? null : (errores[0] ?? null)),
    conDato: snap.ciudades.filter((c) => c.tempC != null && !c.error).length,
    errores,
    ciudades: snap.ciudades.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      conDato: c.tempC != null && !c.error,
      tempC: c.tempC,
      horaDato: c.horaDato,
      error: c.error,
    })),
    nota: "Último clima ahora guardado por el cron del digest. La home vuelve a consultar Open-Meteo si este snapshot no está vigente.",
  };
}

export function cabeceraClimaVivo(clima: ClimaVivoSnapshot): { titulo: string; linea: string } {
  const estado = estadoClimaVivo(clima);
  const lectura = horaLecturaArt(clima.leidoAt);
  if (estado === "stale") {
    const horas = clima.ciudades.map((c) => horaDe(c.horaDato)).filter((h): h is string => Boolean(h)).sort();
    const dato = horas[horas.length - 1] ?? horaLecturaArt(clima.datoLeidoAt);
    const err = clima.errorLectura ? ` · ${clima.errorLectura}` : "";
    return {
      titulo: "CLIMA · último valor",
      linea: `último valor · dato ${dato} ART · reintento ${lectura} sin actualización${err}`,
    };
  }
  if (estado === "sin_dato") {
    return { titulo: "CLIMA AHORA", linea: `lectura ${lectura}` };
  }
  return { titulo: "CLIMA AHORA", linea: `act. ${lectura}` };
}

export function textoCiudadClima(
  c: ClimaCiudad,
  clima: ClimaVivoSnapshot,
): { vacio: boolean; nota: string; sinDato: string | null } {
  const hora = horaDe(c.horaDato) ?? "—";
  if (c.tempC == null || estadoClimaVivo(clima) === "sin_dato") {
    return { vacio: true, nota: "", sinDato: c.error };
  }
  if (estadoClimaVivo(clima) === "stale") {
    return { vacio: false, nota: `último valor · dato ${hora} ART`, sinDato: null };
  }
  return {
    vacio: false,
    nota: `${clima.fuente} · dato ${hora} ART · act. ${horaLecturaArt(clima.leidoAt)}`,
    sinDato: null,
  };
}

async function pedir(url: string, f: ClimaFetch, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(Object.assign(new Error(`timeout ${Math.round(timeoutMs / 1000)}s`), { name: "AbortError" }));
    }, timeoutMs);
  });
  const req = Promise.resolve().then(() =>
    f(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: ctrl.signal,
      cache: "no-store",
    }),
  );
  // Si gana el timeout, el rechazo tardío del fetch no debe quedar sin manejar.
  void req.catch(() => {});
  try {
    return await Promise.race([req, timedOut]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function leerRed(opts: ClimaVivoOpts, now: Date): Promise<ClimaVivoSnapshot> {
  const leidoAt = now.toISOString();
  const timeoutMs = opts.timeoutMs ?? CLIMA_VIVO_TIMEOUT_MS;
  const f = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  try {
    const res = await pedir(urlClimaVivo(), f, timeoutMs);
    if (!res.ok) {
      let reason = "";
      try {
        const j = (await res.json()) as { reason?: unknown };
        if (j && typeof j === "object" && typeof j.reason === "string" && j.reason.trim()) {
          reason = `: ${corto(j.reason)}`;
        }
      } catch {
        /* el status alcanza */
      }
      throw new Error(`HTTP ${res.status}${reason}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new Error("respuesta no es JSON");
    }
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const err = json as OmCurrent;
      if (err.error === true && typeof err.reason === "string" && !("current" in err)) {
        throw new Error(corto(err.reason));
      }
    }
    return interpretarClimaVivo(json, now, leidoAt);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg =
      err instanceof Error && err.name === "AbortError" && !raw.startsWith("timeout")
        ? `timeout ${Math.round(timeoutMs / 1000)}s`
        : corto(raw || "sin dato");
    return fallo(msg, leidoAt, now);
  }
}

type Mem = { until: number; snap: ClimaVivoSnapshot };
let mem: Mem | null = null;

export function resetClimaVivoCache(): void {
  mem = null;
}

function usarMemoria(opts: ClimaVivoOpts, escribir: boolean): boolean {
  if (opts.fetchImpl || opts.now) return false;
  if (!escribir && opts.bypassCache) return false;
  return true;
}

export async function getClimaVivo(opts: ClimaVivoOpts = {}): Promise<ClimaVivoSnapshot> {
  const now = opts.now ?? new Date();
  if (usarMemoria(opts, false) && mem && mem.until > Date.now()) {
    if (mem.snap.estado !== "ok" || mem.snap.ciudades.some((c) => ciudadVigente(c, now))) return mem.snap;
  }
  const snap = await leerRed(opts, now);
  if (usarMemoria(opts, true)) {
    const ok = snap.estado === "ok";
    mem = { until: Date.now() + (ok ? CLIMA_VIVO_CACHE_OK_MS : CLIMA_VIVO_CACHE_FALLO_MS), snap };
  }
  if (snap.estado !== "ok") {
    const error = snap.errorLectura ?? "sin dato";
    logClima("error", "lectura_fallida", { kind: kindDe(error), error, leidoAt: snap.leidoAt });
  }
  return snap;
}

/**
 * Lo que muestra la home. El blob del digest sólo evita la red si es una lectura ok reciente.
 * Si no, se consulta Open-Meteo. Un "sin dato" guardado no se reutiliza como resultado final
 * mientras la fuente responda.
 */
export async function climaVivoParaHome(
  saved: ClimaVivoSnapshot | null | undefined,
  opts: ClimaVivoOpts = {},
): Promise<ClimaVivoSnapshot> {
  const now = opts.now ?? new Date();
  try {
    if (climaVivoSirveDeCache(saved, now) && saved) {
      return { ...saved, estado: "ok", errorLectura: null, datoLeidoAt: saved.datoLeidoAt ?? saved.leidoAt };
    }
    const live = await getClimaVivo(opts);
    if (live.estado === "ok" && live.ciudades.some((c) => ciudadVigente(c, now))) return live;
    return respaldoClimaVivo(saved, live, now);
  } catch (err) {
    const msg = corto(err instanceof Error ? err.message : String(err));
    logClima("error", "lectura_fallida", { kind: "red", error: msg, leidoAt: now.toISOString() });
    return respaldoClimaVivo(saved, fallo(msg, now.toISOString(), now), now);
  }
}
