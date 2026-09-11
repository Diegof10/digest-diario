"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CsvUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setWarn(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/cuits/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Error al subir");
        return;
      }
      setMsg(
        `Listo: ${data.count} CUIT(s) alojados (${data.persistence})${
          data.skipped ? ` · ${data.skipped} fila(s) salteadas` : ""
        }.`
      );
      if (data.warning) setWarn(data.warning);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium">
        CSV de CUITs
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          required
          className="mt-1 block w-full text-sm"
        />
      </label>
      <p className="text-xs opacity-70">
        Columnas: <code>cuit</code> (obligatorio), <code>nombre</code>{" "}
        (opcional), <code>mail_to</code> (opcional). Consentimiento del cliente
        antes de cargar.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-[#1f4a32] px-4 py-2 text-sm font-medium text-[#f3efe6] disabled:opacity-50"
      >
        {busy ? "Subiendo…" : "Subir y alojar lista"}
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
      {warn ? <p className="text-sm text-amber-800">{warn}</p> : null}
    </form>
  );
}
