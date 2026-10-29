import type { AlertaCron } from "@/lib/cron-alertas";

/** Aviso visible cuando un cron devolvió ok: false o no guardó el resumen. */
export default function CronBanner({ alertas }: { alertas: AlertaCron[] }) {
  const graves = alertas.filter((a) => a.severo);
  if (graves.length === 0) return null;
  return (
    <div role="status" className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
      <p className="font-bold">Hay un cron con problemas</p>
      <ul className="mt-1 list-disc pl-4">
        {graves.map((a) => (
          <li key={`${a.cron}-${a.at ?? ""}`}>{a.mensaje}</li>
        ))}
      </ul>
    </div>
  );
}
