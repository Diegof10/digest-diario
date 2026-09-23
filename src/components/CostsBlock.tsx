import type { CatacSnapshot, CostoInsumoSlot } from "@/lib/types";

export default function CostsBlock({
  catac,
  insumos,
  km,
}: {
  catac: CatacSnapshot;
  insumos: CostoInsumoSlot[];
  km: number | null;
}) {
  return (
    <section className="rounded-2xl border border-[#1f4a32]/20 bg-white/70 p-5">
      <h2 className="text-lg font-semibold">Costos</h2>

      <div className="mt-4 rounded-xl bg-[#1f4a32]/5 p-4">
        <h3 className="text-sm font-semibold">Flete CATAC</h3>
        <p className="mt-1 text-xs opacity-70">
          {catac.statusLabel}
          {catac.pdfUrl ? (
            <>
              {" · "}
              <a
                className="underline"
                href={catac.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                PDF fuente
              </a>
            </>
          ) : null}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs opacity-60">Km</dt>
            <dd className="font-mono">{km ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-60">ARS/t</dt>
            <dd className="font-mono">
              {catac.arsPerTon != null
                ? catac.arsPerTon.toLocaleString("es-AR")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs opacity-60">Mes tarifa</dt>
            <dd>{catac.mesShort ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-60">Fuente</dt>
            <dd className="text-xs">{catac.fuente}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs opacity-50">{catac.parseNote}</p>
        <p className="mt-1 text-xs opacity-50">
          Tip: <code>/api/catac?km=180</code> o <code>/api/digest?km=180</code>
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Fertilizantes / gasoil</h3>
        <p className="mt-1 text-xs opacity-60">
          Slots vacíos hasta haber fuente fechada. No se inventan precios.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="py-2 pr-3">Insumo</th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => (
                <tr key={i.id} className="border-t border-[#1f4a32]/10">
                  <td className="py-2 pr-3">{i.label}</td>
                  <td className="py-2 pr-3 font-mono text-xs opacity-70">
                    {i.valor ?? "—"}
                    {i.unidad ? ` ${i.unidad}` : ""}
                  </td>
                  <td className="py-2 pr-3 text-xs opacity-70">{i.fecha ?? "—"}</td>
                  <td className="py-2 text-xs opacity-70">{i.fuente ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
