// Prueba local del cron clima (sin Blob): npx -y tsx scripts/test-clima.mts
import { refreshClima } from "../src/lib/clima-cron";
import { getClima, climaResumen, climaFechaLabel } from "../src/lib/clima";

const { file, resumen } = await refreshClima({ persist: false, prev: null });
console.log(JSON.stringify(resumen, null, 2));
const snap = await getClima({ blob: file });
console.log(`etiqueta=${snap.etiqueta} actualizadoAt=${snap.actualizadoAt}\nnote: ${snap.note}`);
for (const e of snap.entries) {
  console.log(`\n[${e.country}] ${e.fecha}`);
  if (e.pronostico) console.log(`  pronóstico: ${e.pronostico.texto}`);
  if (e.dato) console.log(`  dato: ${e.dato.texto}`);
  console.log(`  perspectiva: ${e.bullet.slice(0, 120)}…`);
  if (e.aviso) console.log(`  AVISO: ${e.aviso.texto}`);
}
console.log(`\nfila tablero: ${climaResumen(snap).slice(0, 300)}\nhora: ${climaFechaLabel(snap)}`);
const sinBlob = await getClima({ blob: null });
console.log(`\nsin blob → etiqueta=${sinBlob.etiqueta} note: ${sinBlob.note}`);
const viejo = await getClima({ blob: file, now: new Date(Date.now() + 40 * 3600_000) });
console.log(`blob de hace 40 h → etiqueta=${viejo.etiqueta} note: ${viejo.note}`);
