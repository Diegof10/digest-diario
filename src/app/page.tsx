import ClimaVivo from "@/components/ClimaVivo";
import CostsBlock from "@/components/CostsBlock";
import FiscalBlock from "@/components/FiscalBlock";
import MarketBoard from "@/components/MarketBoard";
import MorningBrief from "@/components/MorningBrief";
import SiteFooter from "@/components/SiteFooter";
import { getClimaVivo } from "@/lib/clima-vivo";
import { loadResumenMatutino } from "@/lib/resumen-matutino";
import { parseTema } from "@/lib/tema";
import { buildTicker } from "@/lib/ticker";
import Ticker from "@/components/ui/Ticker";
import { assembleDigest, DEFAULT_KM, X_HANDLE, X_PROFILE_URL } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ km?: string; tema?: string }>;
}) {
  const sp = await searchParams;
  const kmRaw = sp.km;
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;

  const tema = parseTema(sp.tema);
  const [digest, climaVivo, cos] = await Promise.all([
    assembleDigest({ km }),
    getClimaVivo(),
    tema !== "base" ? loadResumenMatutino() : Promise.resolve(null),
  ]);
  const ticker = tema !== "base" ? buildTicker(digest.mercado, cos ? { fecha: cos.fecha, lineas: cos.lineas } : null) : [];

  return (
    <div data-tema={tema} className="tema-root">
    {tema !== "base" ? <Ticker items={ticker} /> : null}
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
          <div>
            <h1 className="text-sm font-bold tracking-[0.14em] sm:text-base">
              RESUMEN AGRARIO
            </h1>
            <a
              href={X_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium tracking-normal text-white/75 hover:text-white"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
              {X_HANDLE}
            </a>
          </div>
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

      <ClimaVivo clima={climaVivo} tema={tema} />

      <MarketBoard mercado={digest.mercado} tema={tema} />

      <div className="mt-3">
        <CostsBlock catac={digest.catac} insumos={digest.insumos} km={km} />
      </div>

      <div className="mt-3">
        <FiscalBlock fiscal={digest.fiscal} />
      </div>

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
        <MorningBrief lines={digest.resumenMatutino} tema={tema} />
      </div>

      <SiteFooter pie={digest.pie} />
    </main>
    </div>
  );
}
