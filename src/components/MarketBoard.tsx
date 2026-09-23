import type { MercadoSnapshot } from "@/lib/types";

export default function MarketBoard({ mercado }: { mercado: MercadoSnapshot }) {
  return (
    <section className="rounded-2xl border border-[#1f4a32]/20 bg-white/70 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Mercado</h2>
        <span className="text-xs opacity-60">
          {mercado.ok ? "datos" : "stubs — plug-in Mercado"}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-60">{mercado.note}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase opacity-60">
            <tr>
              <th className="py-2 pr-3">Mercado</th>
              <th className="py-2 pr-3">Producto</th>
              <th className="py-2 pr-3">Valor</th>
              <th className="py-2 pr-3">Fuente</th>
              <th className="py-2">Hora</th>
            </tr>
          </thead>
          <tbody>
            {mercado.rows.map((r) => (
              <tr key={r.id} className="border-t border-[#1f4a32]/10">
                <td className="py-2 pr-3">{r.mercado}</td>
                <td className="py-2 pr-3">{r.producto}</td>
                <td className="py-2 pr-3 font-mono text-xs opacity-70">
                  {r.valor ?? "—"}
                  {r.unidad ? ` ${r.unidad}` : ""}
                </td>
                <td className="py-2 pr-3 text-xs opacity-70">{r.fuente ?? "—"}</td>
                <td className="py-2 text-xs opacity-70">{r.hora ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
