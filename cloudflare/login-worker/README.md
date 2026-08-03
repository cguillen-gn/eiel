# Login EIEL — Cloudflare Worker (gratis)

## Por qué Apps Script falla (y esto no)

El portal hace `POST` a `script.google.com/.../exec`. Google redirige a
`script.googleusercontent.com/macros/echo?...`.

A veces (arranque en frío / saturación tras muchos redespliegues) esa URL
devuelve **HTML 404** en lugar de JSON. El navegador hace `response.json()`,
rompe con `Unexpected token '<'` y el portal muestra
**«Error de conexión con el servidor.»**

No es el municipio ni la contraseña: el front y `login.gs` están bien.
Es la infra de Web Apps de Apps Script. Por eso a veces tarda ~20 s y falla,
y otras (en caliente) responde en 1–3 s.

Este Worker responde JSON siempre, en milisegundos, gratis (plan free de CF).

## Qué hace

1. Recibe `{ codigo, password }` (igual que el portal).
2. Lee la hoja de credenciales con **Google Sheets API** (cuenta de servicio).
3. Devuelve `{ success, valid, nombre, isTest }` (compatible con el index).

Adjuntos / PDF / logger siguen en Apps Script.

## Despliegue (una vez)

### 1. Cuenta de servicio en Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto (o crea uno).
2. **APIs y servicios** → activar **Google Sheets API**.
3. **Credenciales** → **Crear credenciales** → **Cuenta de servicio**.
4. En la cuenta → **Claves** → **Añadir clave** → JSON → descarga el fichero.
5. Abre la hoja  
   `https://docs.google.com/spreadsheets/d/1MtFPW_FDMCKaAnMeYRCyr-qnTIyUUOrSOK5N7cj6Hu8`  
   → **Compartir** con el `client_email` del JSON (solo lectura).

### 2. Cloudflare

1. Cuenta gratis en [dash.cloudflare.com](https://dash.cloudflare.com).
2. En esta carpeta:

```bash
cd cloudflare/login-worker
npm i -g wrangler   # si no lo tienes
npx wrangler login
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# pega el JSON entero de la cuenta de servicio y Enter
npx wrangler secret put MASTER_PASS
# la misma contraseña maestra de pruebas (opcional)
npx wrangler deploy
```

3. Anota la URL, p.ej. `https://eiel-login.<tu-subdominio>.workers.dev`.

### 3. Apuntar el portal

En `.env` (o al regenerar con `gen_forms.py`):

```env
URL_LOGIN_SCRIPT=https://eiel-login.<tu-subdominio>.workers.dev
```

Regenera `docs/index.html` y publica GitHub Pages. O edita a mano
`URL_LOGIN_API` en `docs/index.html` / plantilla.

Hard refresh (Ctrl+Shift+R) y prueba el login.

## Prueba rápida

```bash
curl -s -X POST https://eiel-login.<sub>.workers.dev \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"codigo":"001","password":"x"}'
# → {"success":true,"valid":false,"nombre":"","isTest":false}
```

## Rollback

Vuelve `URL_LOGIN_SCRIPT` a la URL de Apps Script y regenera/publica.
El Worker se puede dejar desplegado sin usarlo.
