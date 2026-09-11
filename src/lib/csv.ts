import { normalizeCuit } from "./sisa";
import type { WatchItem } from "./store";

export type CsvParseResult = {
  ok: boolean;
  items: WatchItem[];
  errors: string[];
  skipped: number;
};

/** Parse CSV: cuit (req), nombre|label (opt), mail_to|mail (opt). */
export function parseCuitsCsv(raw: string): CsvParseResult {
  const errors: string[] = [];
  const items: WatchItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { ok: false, items: [], errors: ["CSV vacío"], skipped: 0 };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const split = (line: string): string[] => {
    const sep = line.includes(";") && !line.includes(",") ? ";" : ",";
    return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, "").trim());
  };

  let start = 0;
  const headerCells = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = headerCells.some((h) =>
    ["cuit", "cuil", "nombre", "label", "mail", "mail_to", "email"].includes(h)
  );

  let idxCuit = 0;
  let idxNombre = -1;
  let idxMail = -1;

  if (hasHeader) {
    start = 1;
    idxCuit = headerCells.findIndex((h) => h === "cuit" || h === "cuil");
    if (idxCuit < 0) idxCuit = 0;
    idxNombre = headerCells.findIndex(
      (h) => h === "nombre" || h === "label" || h === "razon" || h === "razón"
    );
    idxMail = headerCells.findIndex(
      (h) => h === "mail_to" || h === "mail" || h === "email" || h === "correo"
    );
  }

  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    const rawCuit = cells[idxCuit] || "";
    const cuit = normalizeCuit(rawCuit);
    if (!cuit || cuit.length < 11) {
      skipped++;
      errors.push(`Fila ${i + 1}: CUIT inválido (${rawCuit || "vacío"})`);
      continue;
    }
    if (seen.has(cuit)) {
      skipped++;
      continue;
    }
    seen.add(cuit);
    const label =
      idxNombre >= 0 && cells[idxNombre] ? cells[idxNombre] : undefined;
    const mailTo =
      idxMail >= 0 && cells[idxMail] ? cells[idxMail].trim() : null;
    items.push({
      cuit,
      label: label || undefined,
      mailTo: mailTo || null,
    });
  }

  return { ok: items.length > 0, items, errors, skipped };
}
