import { loadLastState, loadWatchlist } from "@/lib/store";
import { scoringLabel } from "@/lib/sisa";

export const dynamic = "force-dynamic";

export default async function Home() {
  const watch = await loadWatchlist();
  const state = await loadLastState();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
        DHF Advisory
      </p>
      <h1 className="mt-2 font-serif text-3xl">Alerta SISA</h1>
      <p className="mt-2 max-w-xl text-sm opacity-80">
        Job diario: baja el padrón RG4310, compara scoring (0=inactivo, 1–3) y
        categoría AL/BA, y avisa al contador por mail si cambió. WhatsApp = v2.
        No es dictamen ni mapa de retenciones.
      </p>

      <section className="mt-8 rounded-2xl border border-[#1f4a32]/20 bg-white/60 p-5">
        <h2 className="text-lg font-semibold">CUITs vigilados</h2>
        <p className="mt-1 text-xs opacity-70">
          Editá <code>src/data/watchlist.json</code>. En Vercel Cron:{" "}
          <code>/api/cron/check</code> con <code>CRON_SECRET</code>.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="py-2 pr-3">CUIT</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Scoring</th>
                <th className="py-2 pr-3">Sit. cat.</th>
                <th className="py-2">Vigencia estado</th>
              </tr>
            </thead>
            <tbody>
              {watch.map((w) => {
                const cuit = w.cuit.replace(/\D/g, "");
                const s = state[cuit];
                return (
                  <tr key={cuit} className="border-t border-[#1f4a32]/10">
                    <td className="py-2 pr-3 font-mono text-xs">{cuit}</td>
                    <td className="py-2 pr-3">{w.label || s?.razonSocial || "—"}</td>
                    <td className="py-2 pr-3">
                      {s ? scoringLabel(s.scoring) : "sin estado"}
                    </td>
                    <td className="py-2 pr-3">{s?.situacionCategoria || "—"}</td>
                    <td className="py-2">{s?.fechaVigenciaEstado || "—"}</td>
                  </tr>
                );
              })}
              {watch.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 opacity-60">
                    Lista vacía
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 border-t border-[#1f4a32]/15 pt-4 text-xs opacity-70">
        Elaborado por DHF Advisory. Análisis de gestión. No es dictamen
        impositivo. Chequear ARCA. Sujeto a revisión de Diego.
      </footer>
    </main>
  );
}
