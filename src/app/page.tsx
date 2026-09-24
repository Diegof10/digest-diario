import CostsBlock from "@/components/CostsBlock";
import MarketBoard from "@/components/MarketBoard";
import MorningBriefCopy from "@/components/MorningBriefCopy";
import { assembleDigest, DEFAULT_KM } from "@/lib/digest";

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
      : DEFAULT_KM;

  const digest = await assembleDigest({ km });

  return (
    <main className="mx-auto w-full max-w-5xl px-2 py-3 sm:px-4 sm:py-5">
      {/* Header bar — placa style */}
      <header className="mb-3 flex items-center justify-between gap-3 rounded-sm bg-[#0b1f3a] px-3 py-2.5 text-white sm:px-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center"
          >
            <span className="relative flex h-4 w-3.5">
              <span className="absolute left-0 top-0 h-4 w-1.5 rounded-full bg-[#c9a227]" />
              <span className="absolute left-1 top-0 h-4 w-1.5 rounded-full bg-[#e67e22] opacity-90" />
              <span className="absolute left-2 top-0 h-4 w-1.5 rounded-full bg-[#1f6b3a] opacity-90" />
            </span>
          </span>
          <h1 className="text-sm font-bold tracking-[0.14em] sm:text-base">
            DHF DIGEST
          </h1>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {digest.fechaCorta}
          </div>
          <div className="hidden text-[10px] capitalize opacity-70 sm:block">
            {digest.fechaLabel}
          </div>
        </div>
      </header>

      <MarketBoard mercado={digest.mercado} />

      <div className="mt-3">
        <CostsBlock catac={digest.catac} insumos={digest.insumos} km={km} />
      </div>

      <section className="digest-panel mt-3">
        <h3 className="digest-panel-title">Fiscal</h3>
        <p className="text-[12px]">{digest.fiscal.novedad}</p>
      </section>

      <section className="digest-panel mt-3">
        <h3 className="digest-panel-title">Lectura</h3>
        <ul className="space-y-1 text-[12px] leading-snug">
          {digest.lectura.map((l, i) => (
            <li key={i} className={l === "—" ? "opacity-40" : ""}>
              {l}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-3">
        <MorningBriefCopy lines={digest.resumenMatutino} />
      </div>

      <footer className="mt-4 border-t border-[#0b1f3a]/15 pt-2 text-[10px] opacity-60">
        {digest.pie}
      </footer>
    </main>
  );
}
