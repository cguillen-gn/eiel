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

hay que elegir **una** de estas dos opciones (recomendamos la A si tenéis Google Workspace / geonet.es):

#### Opción A — Impersonar un usuario Workspace (recomendada)

El Worker actúa como un usuario real (p. ej. `eiel@geonet.es`) y usa **su** cuota.

1. En Google Cloud → cuenta de servicio → copia el **ID único** (número largo; también está en el JSON como `client_id`, no el email).
2. Como **administrador de Google Workspace**:
   - [Admin console](https://admin.google.com/) → **Seguridad** → **Controles de acceso y datos** → **Delegación de todo el dominio**  
     (o busca “Delegación a nivel de dominio”).
   - **Añadir nueva**:
     - ID de cliente: el número del paso 1
     - Ámbitos OAuth:  
       `https://www.googleapis.com/auth/drive`
   - Autorizar.
3. En Cloudflare Worker → Variables:
   - Nombre: `GOOGLE_IMPERSONATE_USER`
   - Valor: el email del usuario a impersonar, p. ej. `eiel@geonet.es`  
     (debe tener acceso de Editor a la carpeta raíz de adjuntos).
4. Deploy. Ping debe mostrar `"has_impersonate": true`.
5. Ese usuario debe poder ver/escribir la carpeta raíz (si la carpeta es de otra cuenta, compartídselo).

#### Opción B — Shared Drive (unidad compartida)

1. Drive → **Unidades compartidas** → Nueva (p. ej. `EIEL Adjuntos`).
2. Añade la cuenta de servicio como miembro **Administrador de contenido** (o superior).
3. Crea/mueve ahí la carpeta raíz de adjuntos (o una nueva y actualizáis el id).
4. En el Worker, `DRIVE_ROOT_FOLDER_ID` = id de esa carpeta **dentro** de la Shared Drive.
5. El código ya envía `supportsAllDrives=true`.

Sin A ni B, el Worker fallará en el PUT y el portal hará fallback a Apps Script.

---

## 2. Desplegar el Worker

### Dashboard
1. Workers → `eiel-adjuntos` (el que ya tengáis) → Edit code → pegar `src/index.js`.
2. Settings → Variables:
   - `DRIVE_ROOT_FOLDER_ID` = `1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV`
   - `GOOGLE_IMPERSONATE_USER` = `eiel@geonet.es` (si usáis opción A)
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
