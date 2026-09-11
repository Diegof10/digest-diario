# Alerta SISA

Monitor diario del padrón SISA (ARCA/AFIP `RG4310.ZIP`). Subís un **CSV de CUITs**; queda alojado; el cron compara scoring/categoría y manda mail si cambió.

**No es dictamen.** Sin % de retención. WhatsApp = v2.

## CSV

Columnas:

| columna | obligatorio | notas |
|---------|-------------|--------|
| `cuit` | sí | con o sin guiones |
| `nombre` | no | sale en la línea 1 del mail |
| `mail_to` | no | si falta, usa `MAIL_TO` |

Consentimiento del cliente antes de cargar CUITs.

## Comportamiento del job

1. Baja `RG4310.ZIP`. Si falla → `padrón no disponible` (no inventa estado).
2. **Primera corrida** por CUIT = **baseline**: guarda estado, **no manda mail**.
3. Corridas siguientes: si cambió scoring (0=inactivo, 1–3) o AL/BA → mail 6 líneas.
4. Si el CUIT **no figura en el padrón** ese día → se marca `no figura en padrón`; no se inventa scoring ni falso cambio.
5. Si solo cambia categoría, la fecha del mail es la de vigencia de categoría.

## Mensaje (6 líneas)

1. CUIT (+ nombre)  
2. estado viejo → nuevo  
3. fecha vigencia  
4. fuente/padrón  
5. chequear ARCA  
6. pie: no es dictamen  

## Env

Ver `.env.example`:

- `CRON_SECRET` — Vercel Cron (`Authorization: Bearer …`)
- `MAIL_TO` / `RESEND_API_KEY` / `MAIL_FROM`
- `BLOB_READ_WRITE_TOKEN` — **en Vercel**, para alojar CSV + last-state entre invocaciones
- `DRY_RUN=1` — diff sin persistir ni enviar

Sin Blob en Vercel el CSV se pierde entre deploys (el disco es efímero).

## Local

```bash
npm i
npm run dev
# subir CSV en la UI, o:
curl -F file=@cuits.csv http://localhost:3000/api/cuits/upload
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/check?dryRun=1"
```

## Deploy

1. Importá `Diegof10/alerta-sisa` en Vercel.
2. Env: `CRON_SECRET`, `MAIL_TO`, Resend, `BLOB_READ_WRITE_TOKEN`.
3. Cron `0 11 * * *` → `/api/cron/check`.

## Fuente

https://serviciosweb.afip.gob.ar/genericos/Registros/op_granos/Archivos/RG_4310.zip  
Diseño: micrositio SISA. Verificar URL si ARCA la mueve.
