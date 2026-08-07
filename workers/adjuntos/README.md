# Adjuntos EIEL — Cloudflare Worker → Google Drive (directo)

Un solo camino para **todos** los ficheros (fotos y PDF grandes):

```
Navegador ──PUT binario──► Worker ──Drive API──► carpetas de siempre
```

Sin base64, sin R2 como puente, sin `import_url` de Apps Script.

Apps Script Adjuntos queda como **fallback** si el Worker falla o no está configurado.

---

## 1. Google Cloud — cuenta de servicio

1. [Google Cloud Console](https://console.cloud.google.com/) → crear/usar un proyecto.
2. **APIs y servicios → Biblioteca** → activar **Google Drive API**.
3. **IAM → Cuentas de servicio → Crear**:
   - Nombre p. ej. `eiel-adjuntos-worker`
   - Sin roles de proyecto (basta compartir la carpeta).
4. En la cuenta → **Claves → Añadir clave → JSON** → descarga el fichero.
5. Abre en Drive la carpeta raíz de adjuntos EIEL  
   (`CARPETA_RAIZ_ID` = `1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV`).
6. **Compartir** con el email de la cuenta de servicio  
   (`…@….iam.gserviceaccount.com`) como **Editor**.

---

## 2. Desplegar el Worker

### Dashboard
1. Workers → `eiel-adjuntos` (el que ya tengáis) → Edit code → pegar `src/index.js`.
2. Settings → Variables:
   - `DRIVE_ROOT_FOLDER_ID` = `1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV`
3. Secrets:
   - `UPLOAD_SECRET` = cadena larga aleatoria
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = **contenido completo** del JSON de la clave  
     (todo el fichero en una sola secret; las `\n` del private_key se conservan).
4. Si teníais binding R2, podéis dejarlo; **ya no se usa**.
5. Deploy.

### CLI
```bash
cd workers/adjuntos
npm install
npx wrangler secret put UPLOAD_SECRET
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON   # pegar el JSON entero
npx wrangler deploy
```

Comprobar:

```bash
curl -sL "https://eiel-adjuntos.<subdominio>.workers.dev/?action=ping"
```

Debe devolver:

- `"mode":"drive_direct"`
- `"has_secret":true`
- `"has_service_account":true`
- `"has_root_folder":true`

---

## 3. Activar en el portal

Consola del navegador (logueado):

```js
localStorage.setItem("eiel_adjuntos_worker", "https://eiel-adjuntos.cguillen-4b9.workers.dev");
location.reload();
```

**Incluid `https://`.**

Desactivar (volver solo a Apps Script):

```js
localStorage.removeItem("eiel_adjuntos_worker");
location.reload();
```

---

## 4. Qué mirar en una prueba

- Network: `POST` al Worker (presign) + `PUT /u/…` → JSON `via:"drive_direct"`.
- **No** debe hacer falta `import_url` a Apps Script para esos ficheros.
- Drive: mismas carpetas `municipio / id_envio / sección`.
- Si el Worker falla, el portal hace fallback a Apps Script (base64).

---

## 5. Notas

- Límite 35 MB (igual que antes).
- Idempotencia: si el nombre ya existe en la carpeta destino, no duplica.
- Equipamientos (`-E-` / `_E_` / `EXP_E…`): fichero directo bajo `id_envio` (como Apps Script).
- Plan free de Workers suele bastar; PDF muy grandes y lentos pueden acercarse al límite de duración del Worker — si hubiera timeouts, subir a Workers de pago ($5) o bajar concurrencia.
