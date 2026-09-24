"use client";

import { useState } from "react";

export default function MorningBriefCopy({ lines }: { lines: string[] }) {
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
    <section className="digest-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="digest-panel-title mb-0">Resumen matutino</h3>
        <button
          type="button"
          onClick={copy}
          className="rounded bg-[#0b1f3a] px-3 py-1 text-[11px] font-semibold text-white"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </section>
  );
}
