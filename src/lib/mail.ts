import { buildAlertLines, type SisaChange } from "./diff";
import { SISA_FUENTE } from "./sisa";

export type MailResult = {
  sent: boolean;
  mode: "resend" | "log";
  to: string;
  body: string;
  error?: string;
};

export async function sendSisaAlert(opts: {
  to: string;
  change: SisaChange;
}): Promise<MailResult> {
  const body = buildAlertLines(opts.change, SISA_FUENTE);
  const subject = `Alerta SISA · CUIT ${opts.change.cuit}`;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "alerta-sisa@dhf.local";

  if (!key) {
    console.log("[alerta-sisa] MAIL LOG (sin RESEND_API_KEY)\n", subject, "\n", body);
    return { sent: false, mode: "log", to: opts.to, body };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return {
        sent: false,
        mode: "resend",
        to: opts.to,
        body,
        error: `Resend HTTP ${res.status}: ${t.slice(0, 200)}`,
      };
    }
    return { sent: true, mode: "resend", to: opts.to, body };
  } catch (e) {
    return {
      sent: false,
      mode: "resend",
      to: opts.to,
      body,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
