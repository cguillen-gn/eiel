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

### Obligatorio: cuota de Drive (error 403)

Las cuentas de servicio **no tienen cuota** en «Mi unidad». Si ves:

`Service Accounts do not have storage quota`

**Si no eres admin de Workspace** (caso habitual): usa la **opción OAuth de usuario** más abajo.  
No hace falta Shared Drive ni delegación de dominio.

#### Opción OAuth de usuario (recomendada sin admin)

El Worker sube **como tu usuario de Google** (el dueño/editor de la carpeta EIEL).

1. [Google Cloud Console](https://console.cloud.google.com/) → el mismo proyecto → **APIs y servicios → Credenciales**.
2. **Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación de escritorio** (Desktop).
   - Nombre: `eiel-adjuntos-oauth`.
   - Crear → anota **ID de cliente** y **Secreto del cliente**.
3. Si pide pantalla de consentimiento OAuth:
   - Tipo de usuario: **Interno** (si el proyecto es de Workspace) o Externo en modo prueba.
   - Añade tu email como usuario de prueba si es Externo.
   - Ámbitos: no hace falta listarlos aquí; se piden en el paso 4.
4. Abre [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   - Click en el engranaje ⚙️ (arriba a la derecha).
   - Marca **Use your own OAuth credentials**.
   - Pega el **Client ID** y **Client secret** del paso 2.
   - Cerrar.
5. En la lista de la izquierda, busca **Drive API v3** → marca  
   `https://www.googleapis.com/auth/drive`  
   → **Authorize APIs**.
6. Inicia sesión con la cuenta que **tiene la carpeta de adjuntos** (Editor/dueño).
7. Acepta permisos → **Exchange authorization code for tokens**.
8. Copia el **Refresh token** (no caduca mientras no lo revoques).
9. En Cloudflare Worker → Secrets (tres secrets):
   - `GOOGLE_OAUTH_CLIENT_ID` = el ID de cliente  
   - `GOOGLE_OAUTH_CLIENT_SECRET` = el secreto  
   - `GOOGLE_OAUTH_REFRESH_TOKEN` = el refresh token  
10. Deploy. Ping debe mostrar `"auth_mode":"oauth_user"` y `"has_oauth_user":true`.

La cuenta de servicio JSON **ya no es necesaria** si usáis OAuth de usuario (podéis dejarla o quitarla).

#### Otras opciones (sí requieren admin / Workspace)

- **Impersonación** (`GOOGLE_IMPERSONATE_USER` + delegación de dominio): hace falta admin.
- **Shared Drive**: unidad compartida + SA como miembro; a menudo también hace falta permiso de org.

---

## 2. Desplegar el Worker

### Dashboard
1. Workers → `eiel-adjuntos` → Edit code → pegar `src/index.js`.
2. Settings → Variables:
   - `DRIVE_ROOT_FOLDER_ID` = `1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV`
3. Secrets (camino OAuth, sin admin):
   - `UPLOAD_SECRET`
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REFRESH_TOKEN`
4. Deploy.

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
- `"has_root_folder":true`
- `"auth_mode":"oauth_user"` y `"has_oauth_user":true` (camino sin admin)

---

## 3. Activar en el portal

La URL del Worker va **fija** en los HTML (`urlAdjuntosWorker` en `EIEL_CONFIG`):

`https://eiel-adjuntos.cguillen-4b9.workers.dev`

Tras publicar Pages, un hard refresh basta. Ya no hace falta `localStorage`.

Override puntual (pruebas):

```js
localStorage.setItem("eiel_adjuntos_worker", "https://otro-worker.workers.dev");
location.reload();
```

(`urlAdjuntosWorker` en el HTML tiene prioridad sobre `localStorage`.)

---

## 4. Qué mirar en una prueba

- Network: `POST ensure_path` (una vez) + `POST` presign + `PUT /u/…` → JSON `via:"drive_direct"`.
- **No** debe hacer falta `import_url` a Apps Script para esos ficheros.
- Drive: una sola carpeta `municipio / id_envio / sección` (sin gemelas `ENVIO_*`).
- Si el Worker falla tras reintentos, el portal hace fallback a Apps Script (base64).

**Despliegue Worker:** tras cambios en `src/index.js`, `npx wrangler deploy` en `workers/adjuntos/` (o Edit code → Deploy en el panel).

Orígenes CORS por defecto: `https://eiel.diputacionalicante.es`, GitHub Pages y localhost.
Extra: variable `ALLOWED_ORIGINS` (lista separada por comas; se **suma** a los defaults).

---

## 5. Notas

- Límite 35 MB (igual que antes).
- Idempotencia: si el nombre ya existe en la carpeta destino, no duplica.
- Equipamientos (`-E-` / `_E_` / `EXP_E…`): fichero directo bajo `id_envio` (como Apps Script).
- Plan free de Workers suele bastar; PDF muy grandes y lentos pueden acercarse al límite de duración del Worker — si hubiera timeouts, subir a Workers de pago ($5) o bajar concurrencia.
