import { normalizeCuit } from "./sisa";
import type { WatchItem } from "./store";

export type CsvParseResult = {
  ok: boolean;
  items: WatchItem[];
  errors: string[];
  skipped: number;
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Excel often exports CUIT as 2.0111111112e+10 — recover digits. */
export function coerceCuitCell(raw: string): string {
  const s = String(raw ?? "").trim().replace(/^"|"$/g, "").trim();
  if (!s) return "";
  // scientific notation
  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    try {
      const n = Number(s);
      if (Number.isFinite(n)) {
        const asInt = Math.round(n).toString();
        return normalizeCuit(asInt);
      }
    } catch {
      /* fall through */
    }
  }
  // keep only digits (and tolerate spaces/dashes via normalizeCuit)
  return normalizeCuit(s);
}

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
    const sep = (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";
    return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, "").trim());
  };

  let start = 0;
  const headerCells = split(lines[0]).map(normHeader);
  const hasHeader = headerCells.some((h) =>
    ["cuit", "cuil", "nombre", "label", "mail", "mail_to", "email", "correo", "razon", "razon_social"].includes(h)
  );

  let idxCuit = 0;
  let idxNombre = -1;
  let idxMail = -1;

  if (hasHeader) {
    start = 1;
    idxCuit = headerCells.findIndex((h) => h === "cuit" || h === "cuil");
    if (idxCuit < 0) {
      return {
        ok: false,
        items: [],
        errors: [
          `No encontré columna "cuit". Encabezados: ${split(lines[0]).join(" | ")}`,
        ],
        skipped: 0,
      };
    }
    idxNombre = headerCells.findIndex((h) =>
      ["nombre", "label", "razon", "razon_social", "denominacion"].includes(h)
    );
    idxMail = headerCells.findIndex((h) =>
      ["mail_to", "mail", "email", "correo"].includes(h)
    );
  }

  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    if (cells.every((c) => !c)) continue;
    const rawCuit = cells[idxCuit] || "";
    let cuit = coerceCuitCell(rawCuit);
    // pad if Excel dropped leading zeros somehow (rare for CUIT)
    if (cuit.length > 0 && cuit.length < 11 && /^\d+$/.test(cuit)) {
      // don't invent — leave invalid
    }
    if (cuit.length > 11 && cuit.endsWith("0") && /^[+-]?\d+(\.\d+)?e/i.test(rawCuit)) {
      // scientific sometimes rounds; keep as-is and fail clearly
    }
    if (!cuit || cuit.length !== 11) {
      skipped++;
      errors.push(
        `Fila ${i + 1}: CUIT inválido (${rawCuit || "vacío"} → ${cuit || "—"}). Tiene que quedar en 11 dígitos (sin notación científica).`
      );
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
