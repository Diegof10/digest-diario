# Alerta SISA

Monitor diario del padrón SISA (ARCA/AFIP `RG4310.ZIP`). Si cambia el **scoring** (0 = inactivo, 1–3) o la **situación de categoría AL/BA** de un CUIT vigilado, manda mail al contador.

**No es dictamen.** No calcula alícuotas de retención. WhatsApp = v2.

## Mensaje (6 líneas)

1. CUIT  
2. estado viejo → nuevo  
3. fecha vigencia  
4. fuente/padrón  
5. chequear ARCA  
6. pie: no es dictamen  

Si el padrón no baja → `padrón no disponible` (no se inventa estado).

## Stack

Next.js (App Router) + Vercel Cron + mail Resend (opcional).

## Env

Ver `.env.example`:

- `CRON_SECRET` — obligatorio en producción (Vercel Cron manda `Authorization: Bearer …`)
- `MAIL_TO` — mail del contador
- `RESEND_API_KEY` / `MAIL_FROM` — si faltan, el check **loguea** el cuerpo del mail (modo demo)
- `DRY_RUN=1` — diff sin persistir ni enviar

## CUITs

Editá `src/data/watchlist.json`. Pedí consentimiento antes de mandar CUIT por chat/mail.

## Correr local

```bash
npm i
npm run dev
# dry-run del job:
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/check?dryRun=1"
```

## Deploy Vercel

1. Importá `Diegof10/alerta-sisa` (sin secretos de más).
2. Cargá `CRON_SECRET`, `MAIL_TO`, `RESEND_API_KEY`, `MAIL_FROM`.
3. Cron: `0 11 * * *` → `/api/cron/check` (~8:00 AR).

**Nota persistencia:** en serverless el FS es efímero. Para producción estable, el próximo paso es guardar `last-state` en Redis/Blob. En local, `src/data/last-state.json` alcanza.

## Fuente

`https://serviciosweb.afip.gob.ar/genericos/Registros/op_granos/Archivos/RG_4310.zip`  
Diseño: micrositio SISA / diseño de registro. Verificar si ARCA mueve la URL.

## Fuera de alcance

- WhatsApp Business (v2)
- % de retención / liquidación
- Borrar u otros repos de Agro Planeamiento
