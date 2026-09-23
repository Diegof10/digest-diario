import type { FiscalSnapshot } from "@/lib/types";

export async function getFiscal(): Promise<FiscalSnapshot> {
  return {
    ok: false,
    novedad: "sin novedad fiscal",
    fuente: null,
    fetchedAt: new Date().toISOString(),
  };
}
