# Login EIEL — Cloudflare Worker

Sustituye el Web App de Apps Script (`URL_LOGIN_SCRIPT`) para que el
**primer** Entrar no dependa del cold start de Google.

Misma API que `appscript/login.gs`:

```http
POST /
Content-Type: text/plain;charset=utf-8

{"codigo":"006","password":"••••"}
```

```json
{ "success": true, "valid": true, "nombre": "Alcalalí", "isTest": false }
```

El `index.html` **no cambia de lógica**: solo apunta `URL_LOGIN_SCRIPT` a la URL del Worker.

---

## 1. Requisitos

- Cuenta Cloudflare (plan free)
- Node.js 18+
- Acceso a la hoja de credenciales (exportar JSON una vez)

## 2. Crear KV y desplegar

```bash
cd workers/login
npm install

# Crear namespace KV (anota el id)
npx wrangler kv namespace create CREDENTIALS_KV
npx wrangler kv namespace create CREDENTIALS_KV --preview

# Editar wrangler.toml → id y preview_id
```

Secretos:

```bash
npx wrangler secret put MASTER_PASS    # misma clave maestra de pruebas
npx wrangler secret put SYNC_SECRET    # para subir credenciales por API
npx wrangler deploy
```

La URL será del estilo:

`https://eiel-login.<tu-subdominio>.workers.dev`

Comprobar:

```bash
curl -sL "https://eiel-login.…/workers.dev?action=ping"
```

## 3. Cargar credenciales (desde la hoja Google)

### Opción A — Export desde Apps Script

1. En el proyecto que ya tiene acceso a la hoja de credenciales (o crea uno
   temporal), pega `appscript/export-credenciales-login.gs` y ejecuta
   `exportCredencialesJson`.
2. Copia el JSON del log (o el fichero en Drive) a
   `workers/login/credenciales.json`.
3. Sube a KV:

```bash
cd workers/login
npm run kv:put-credenciales
# o:
npx wrangler kv key put --binding CREDENTIALS_KV credenciales --path ./credenciales.json
```

### Opción B — Sync por API (tras deploy)

```bash
curl -sL -X POST "https://eiel-login.…/workers.dev" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "action": "sync_credenciales",
  "secret": "TU_SYNC_SECRET",
  "credenciales": {
    "006": { "clave": "xxxx", "nombre": "Alcalalí" }
  }
}
EOF
```

**No subas `credenciales.json` al repo** (está en `.gitignore`).

Cuando cambien claves en la hoja: vuelve a exportar y a hacer el `kv key put`
(o el sync). No es automático.

## 4. Apuntar el portal al Worker

En `.env`:

```env
URL_LOGIN_SCRIPT=https://eiel-login.<tu-subdominio>.workers.dev
```

Regenera el index (`generate.bat` / `gen_forms.py`) **o** edita a mano
`docs/index.html` la línea `URL_LOGIN_API`.

Merge + Pages + hard refresh. Prueba:

1. Login normal de un municipio  
2. Login con `MASTER_PASS` (debe salir `(PRUEBAS)`)  
3. Código incorrecto  

Mide el primer Entrar en frío (ventana privada, sin haber abierto el portal
hace rato): debería ser mucho más corto que Apps Script.

## 5. Rollback

Vuelve `URL_LOGIN_SCRIPT` a la URL antigua de Apps Script y regenera/publica
el index. El Worker puede quedar desplegado sin uso.

## 6. Fase 2 (después, si el login va bien)

Tokens HMAC firmados por el Worker en el login OK, y Adjuntos/PDF los
exigen otra vez — sin pasar el login por Apps Script. Eso es un PR aparte.

## Seguridad (breve)

- Rate limit básico ~30 intentos/min/IP (en KV).
- CORS: `eiel.diputacionalicante.es`, GitHub Pages y localhost (ampliable con `ALLOWED_ORIGINS`).
- `SYNC_SECRET` obligatorio para volcar credenciales.
- Las claves en KV son tan sensibles como en la hoja: protege la cuenta CF.
