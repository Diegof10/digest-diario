/**
 * Clima en vivo (tope de la home): Buenos Aires, Santa Fe (ciudad) y Córdoba (ciudad).
 * Fuente: Open-Meteo (api.open-meteo.com, `current`, sin clave). Es salida de modelo,
 * no lectura de estación → se rotula "Open-Meteo (modelo)".
 * (SMN ws.smn.gob.ar responde 503 a pedidos automáticos, por eso no se usa.)
 * Cache 10 min. Hora mostrada = `current.time` del propio dato (ART) + hora de lectura.
 * Si falla o el dato tiene más de 2 h → "sin dato · Open-Meteo (modelo)".
 */

export const CLIMA_VIVO_FUENTE = "Open-Meteo (modelo)";
export const CLIMA_VIVO_URL = "https://open-meteo.com/";

const CIUDADES = [
  { id: "caba", nombre: "Buenos Aires", lat: -34.61, lon: -58.38 },
  { id: "santafe", nombre: "Santa Fe", lat: -31.63, lon: -60.7 },
  { id: "cordoba", nombre: "Córdoba", lat: -31.42, lon: -64.18 },
] as const;

export interface ClimaCiudad {
  id: string;
  nombre: string;
  tempC: number | null;
  condicion: string | null;
  vientoKmh: number | null;
  vientoDir: string | null;
  /** current.time de Open-Meteo, hora local ART "yyyy-mm-ddThh:mm" */
  horaDato: string | null;
  error: string | null;
}

export interface ClimaVivoSnapshot {
  fuente: string;
  url: string;
  ciudades: ClimaCiudad[];
  leidoAt: string;
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

/** "yyyy-mm-ddThh:mm" ART → Date */
function artToDate(s: string): Date {
  return new Date(`${s}:00-03:00`);
}

type OmCurrent = {
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
};

export async function getClimaVivo(): Promise<ClimaVivoSnapshot> {
  const leidoAt = new Date().toISOString();
  const qs = new URLSearchParams({
    latitude: CIUDADES.map((c) => c.lat).join(","),
    longitude: CIUDADES.map((c) => c.lon).join(","),
    current: "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m",
    timezone: "America/Argentina/Buenos_Aires",
    wind_speed_unit: "kmh",
  });
  const sinDato = (error: string): ClimaCiudad[] =>
    CIUDADES.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tempC: null,
      condicion: null,
      vientoKmh: null,
      vientoDir: null,
      horaDato: null,
      error,
    }));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    let data: OmCurrent[];
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
        next: { revalidate: 600 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as OmCurrent[] | OmCurrent;
      data = Array.isArray(j) ? j : [j];
    } finally {
      clearTimeout(t);
    }
    const now = Date.now();
    const ciudades = CIUDADES.map((c, i): ClimaCiudad => {
      const cur = data[i]?.current;
      const temp = cur?.temperature_2m;
      const time = cur?.time ?? null;
      const base = { id: c.id, nombre: c.nombre, horaDato: time };
      if (typeof temp !== "number" || !Number.isFinite(temp) || !time) {
        return { ...base, tempC: null, condicion: null, vientoKmh: null, vientoDir: null, error: "respuesta sin dato" };
      }
      if (now - artToDate(time).getTime() > 2 * 3600_000) {
        return { ...base, tempC: null, condicion: null, vientoKmh: null, vientoDir: null, error: "dato de más de 2 h" };
      }
      return {
        ...base,
        tempC: temp,
        condicion: condicionWmo(cur?.weather_code),
        vientoKmh: typeof cur?.wind_speed_10m === "number" ? cur.wind_speed_10m : null,
        vientoDir: dirCardinal(cur?.wind_direction_10m),
        error: null,
      };
    });
    return { fuente: CLIMA_VIVO_FUENTE, url: CLIMA_VIVO_URL, ciudades, leidoAt };
  } catch (err) {
    return {
      fuente: CLIMA_VIVO_FUENTE,
      url: CLIMA_VIVO_URL,
      ciudades: sinDato(err instanceof Error ? err.message : String(err)),
      leidoAt,
    };
  }
}
