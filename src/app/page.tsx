import CsvUpload from "@/components/CsvUpload";
import { loadLastState, loadWatchlist, persistenceMode } from "@/lib/store";
import { scoringLabel } from "@/lib/sisa";

export const dynamic = "force-dynamic";

export default async function Home() {
  const watch = await loadWatchlist();
  const state = await loadLastState();
  const mode = persistenceMode();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
        DHF Advisory
      </p>
      <h1 className="mt-2 font-serif text-3xl">Alerta SISA</h1>
      <p className="mt-2 max-w-xl text-sm opacity-80">
        Cargás un CSV de CUITs, queda alojado, y el cron diario baja el padrón
        RG4310 y avisa por mail si cambió scoring (0=inactivo, 1–3) o categoría
        AL/BA. Primera corrida = baseline (no manda mail). WhatsApp = v2.
      </p>

      <section className="mt-8 rounded-2xl border border-[#1f4a32]/20 bg-white/60 p-5">
        <h2 className="text-lg font-semibold">Cargar CSV</h2>
        <p className="mt-1 text-xs opacity-70">
          Persistencia: <strong>{mode}</strong>
          {mode === "filesystem"
            ? " — este deploy no ve BLOB_READ_WRITE_TOKEN. Conectá el Blob al proyecto, marcá Production+Preview y hacé Redeploy (no alcanza con crear el store)."
            : " (Vercel Blob OK)"}
        </p>
        <p className="mt-1 text-xs opacity-60">
          Diagnóstico: <code>/api/health</code> → mirá <code>blobTokenPresent</code>.
        </p>
        <div className="mt-4">
          <CsvUpload />
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-[#1f4a32]/20 bg-white/60 p-5">
        <h2 className="text-lg font-semibold">
          Lista alojada ({watch.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="py-2 pr-3">CUIT</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Scoring</th>
                <th className="py-2 pr-3">Sit. cat.</th>
                <th className="py-2">Vigencia</th>
              </tr>
            </thead>
            <tbody>
              {watch.map((w) => {
                const cuit = w.cuit.replace(/\D/g, "");
                const s = state[cuit];
                return (
                  <tr key={cuit} className="border-t border-[#1f4a32]/10">
                    <td className="py-2 pr-3 font-mono text-xs">{cuit}</td>
                    <td className="py-2 pr-3">
                      {w.label || s?.razonSocial || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {s ? scoringLabel(s.scoring) : "sin baseline"}
                    </td>
                    <td className="py-2 pr-3">
                      {s?.situacionCategoria || "—"}
                    </td>
                    <td className="py-2">{s?.fechaVigenciaEstado || "—"}</td>
                  </tr>
                );
              })}
              {watch.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 opacity-60">
                    Todavía no hay CSV cargado
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
