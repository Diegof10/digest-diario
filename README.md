# Digest diario

Producto matutino de DHF Advisory: tablero web + APIs para armar el digest agro del día (mercado, costos CATAC, fiscal, lectura, WhatsApp 8 líneas).

Repo GitHub: `Diegof10/alerta-sisa` (mismo remote; el deploy Vercel de ese proyecto sirve esta página). **No** toca Agro Planeamiento ni `dhf-margenes`.

## Qué muestra la home

1. Fecha (America/Argentina/Cordoba)
2. Tablero Mercado — Chicago / Matba / CAC Rosario / USDA / BNA (clima/noticias/WTI vacíos sin fuente)
3. Costos — flete CATAC (km → ARS/t) + slots fert/gasoil vacíos
4. Fiscal — una línea (`sin novedad fiscal` stub)
5. Lectura — 5–6 líneas (slot Informe)
6. WhatsApp 8 líneas (copiar)
7. Pie: *Elaborado por DHF Advisory. Análisis de gestión. No es orden de venta ni dictamen impositivo.*

## APIs

| Ruta | Rol |
|------|-----|
| `GET /api/health` | Salud + nombre de producto |
| `GET /api/digest?km=` | Arma el snapshot completo |
| `GET /api/catac?km=` | Tarifa CATAC km→ARS/t |
| `GET /api/mercado` | Mercado live vía feed granos (Chicago/Matba/CAC/USDA/BNA) |
| `GET /api/fiscal` | Stub Fiscal |
| `GET /api/cron/digest` | Cron diario (Bearer `CRON_SECRET`) |

## Mercado (feed granos)

`GET https://lark-lake-solar-craft.grok.me/api/granos` — server-side, User-Agent browser-like. Mapea CBOT, CAC Rosario, Matba, FAS/pizarra, BNA, WASDE/Crop Progress. **No inventa precios**; celdas vacías si falta fuente.

## CATAC

- Intenta media WordPress en `api.apicatac.com`.
- Si el fetch falla (bot-wall / sin JSON), usa **fallback embebido** de la tarifa de referencia **abril 2026**, etiquetada **último valor guardado (abr-26)**.
- **Nunca** se inventan precios. Fert/gasoil quedan vacíos hasta fuente fechada.

PDF oficial de referencia:

https://api.apicatac.com/wp-content/uploads/2026/04/TARIFA-REFERENCIA-CATAC-ABRIL-26.pdf

## Cron

`vercel.json`: `0 10 * * *` → `/api/cron/digest`

7:00 ARG = 10:00 UTC (UTC−3).

## Local

```bash
npm i
npm run dev
# http://localhost:3000
# http://localhost:3000/?km=180
curl -s 'http://localhost:3000/api/digest?km=180' | jq .
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
```

## Env

Ver `.env.example`: `CRON_SECRET`.

## Dueños de formato / datos

- **Informe**: WhatsApp 8 líneas + PDF 1 página + pie DHF.
- **Costos**: CATAC + fert/gasoil (si hay fuente fechada).
- **Mercado**: plug-in Chicago/Matba/CAC/USDA/clima/WTI.
- **Fiscal**: una línea de novedad.
