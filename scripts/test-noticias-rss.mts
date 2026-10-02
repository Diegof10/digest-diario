// Prueba local del flujo RSS (sin Blob): npx -y tsx scripts/test-noticias-rss.mts [--todos]
import { buscarNoticiasRss, horaArt } from "../src/lib/noticias-rss";

const r = await buscarNoticiasRss(new Date(), { max: process.argv.includes("--todos") ? 40 : 5 });
console.log(`feeds ok ${r.feedsOk}/${r.feedsTotal} · items ${r.itemsLeidos} · candidatos ${r.candidatos}`);
for (const n of r.noticias) {
  console.log(`- ${n.titulo}\n  ${n.fuente} · ${horaArt(n.publicado)} · score ${n.score} [${n.keywords.join(", ")}]\n  ${n.url}`);
}
