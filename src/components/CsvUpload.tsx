"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CsvUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setWarn(null);
    setDetails([]);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/cuits/upload", { method: "POST", body: fd });
      let data: {
        ok?: boolean;
        error?: string;
        details?: string[];
        count?: number;
        skipped?: number;
        persistence?: string;
        warning?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        setMsg(`Error HTTP ${res.status} (respuesta no JSON)`);
        return;
      }
      if (!res.ok || !data.ok) {
        setMsg(data.error || `Error al subir (HTTP ${res.status})`);
        if (Array.isArray(data.details)) setDetails(data.details.slice(0, 10));
        return;
      }
      setMsg(
        `Listo: ${data.count} CUIT(s) alojados (${data.persistence})${
          data.skipped ? ` · ${data.skipped} fila(s) salteadas` : ""
        }.`
      );
      if (data.warning) setWarn(data.warning);
      if (Array.isArray(data.details) && data.details.length) {
        setDetails(data.details.slice(0, 10));
      }
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
          accept=".csv,text/csv,text/plain,.txt"
          required
          className="mt-1 block w-full text-sm"
        />
      </label>
      <p className="text-xs opacity-70">
        Columnas: <code>cuit</code> (obligatorio), <code>nombre</code>{" "}
        (opcional), <code>mail_to</code> (opcional). Guardá como CSV UTF-8, no
        .xlsx. En Excel, la columna CUIT como texto.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-[#1f4a32] px-4 py-2 text-sm font-medium text-[#f3efe6] disabled:opacity-50"
      >
        {busy ? "Subiendo…" : "Subir y alojar lista"}
      </button>
      {msg ? <p className="text-sm whitespace-pre-wrap">{msg}</p> : null}
      {warn ? <p className="text-sm text-amber-800">{warn}</p> : null}
      {details.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-amber-900">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
