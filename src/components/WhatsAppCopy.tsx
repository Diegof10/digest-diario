"use client";

import { useState } from "react";

export default function WhatsAppCopy({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#1f4a32]/20 bg-white/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">WhatsApp · 8 líneas</h2>
        <button
          type="button"
          onClick={copy}
          className="rounded-full bg-[#1f4a32] px-4 py-1.5 text-xs font-semibold text-[#f3efe6]"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-1 text-xs opacity-60">
        Formato a cargo de Informe. Scaffold con slots vacíos donde falta dato.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        {lines.map((line, i) => (
          <li key={i} className="leading-snug">
            {line}
          </li>
        ))}
      </ol>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-[#1f4a32]/5 p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </section>
  );
}
