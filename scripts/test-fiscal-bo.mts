// Prueba local del cron fiscal (sin Blob): npx -y tsx scripts/test-fiscal-bo.mts [--hoy=yyyy-mm-dd] [--dias=7]
import { refreshFiscal } from "../src/lib/fiscal-cron";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const hoy = arg("hoy");
const now = hoy ? new Date(`${hoy}T08:00:00-03:00`) : new Date();
const { file, resumen } = await refreshFiscal({ now, persist: false, prev: null });
console.log(JSON.stringify(resumen, null, 2));
for (const i of file.items) {
  console.log(`- [${i.boFecha}] ${i.norma} — ${i.titulo}\n  ${i.organismo} · temas: ${i.temas.join(", ")}\n  ${i.url}`);
}
console.log(`SISA huella: ${file.sisa?.hash ?? "—"}`);
