import CostsBlock from "@/components/CostsBlock";
import MarketBoard from "@/components/MarketBoard";
import WhatsAppCopy from "@/components/WhatsAppCopy";
import { assembleDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ km?: string }>;
}) {
  const sp = await searchParams;
  const kmRaw = sp.km;
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : null;

  const digest = await assembleDigest({ km });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
          DHF Advisory
        </p>
        <h1 className="font-serif text-3xl leading-tight">Digest diario</h1>
        <p className="text-sm opacity-80">
          {digest.fechaLabel}
          <span className="mx-2 opacity-40">·</span>
          <span className="font-mono text-xs">{digest.fecha}</span>
        </p>
        <p className="max-w-xl text-sm opacity-70">
          Tablero matutino: mercado (stubs), costos CATAC, fiscal y lectura.
          Cron 7:00 ARG. Formato WhatsApp / PDF a cargo de Informe.
        </p>
      </header>

      <MarketBoard mercado={digest.mercado} />

      <CostsBlock catac={digest.catac} insumos={digest.insumos} km={km} />

      <section className="rounded-2xl border border-[#1f4a32]/20 bg-white/70 p-5">
        <h2 className="text-lg font-semibold">Fiscal</h2>
        <p className="mt-2 text-sm">{digest.fiscal.novedad}</p>
        <p className="mt-1 text-xs opacity-60">
          Stub Fiscal · {digest.fiscal.ok ? "ok" : "sin fuente live"}
        </p>
      </section>

      <section className="rounded-2xl border border-[#1f4a32]/20 bg-white/70 p-5">
        <h2 className="text-lg font-semibold">Lectura</h2>
        <p className="mt-1 text-xs opacity-60">
          Slot 5–6 líneas — Informe completa. No inventar.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm opacity-80">
          {digest.lectura.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>

      <WhatsAppCopy lines={digest.whatsapp} />

      <footer className="border-t border-[#1f4a32]/15 pt-4 text-xs opacity-70">
        {digest.pie}
      </footer>
    </main>
  );
}
