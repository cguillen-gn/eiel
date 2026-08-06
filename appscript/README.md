# Apps Script — Adjuntos, PDF, login y logger

## Login rápido (recomendado)

El login por Apps Script sufre cold start. Preferir el **Cloudflare Worker**
en `workers/login/` (misma API). `login.gs` queda como rollback.

---

## D — Token de sesión (**DESACTIVADO** temporalmente)

Los tokens HMAC se desactivaron para recuperar un login **rápido y gratis**
en Apps Script (como antes). El portal ya no emite ni exige
`eiel_session_token`; Adjuntos/PDF solo validan token **si llega** (opcional).

| Pieza | Archivo |
|-------|---------|
| Login (simple) | `login.gs` |
| Adjuntos | `adjuntos.gs` + `log-errores.gs` |
| PDF | `generar-pdf.gs` + `log-errores.gs` |
| Front | `js/eiel-forms.js` + `docs/index.html` |
| HMAC (opcional / futuro) | `auth-token.gs` |

### Despliegue para quitar tokens

1. **Login:** pegar `login.gs` → **Nueva versión** (no hace falta `auth-token`).
2. **Adjuntos** y **PDF:** pegar `adjuntos.gs` / `generar-pdf.gs` → **Nueva versión**.
3. **Front:** merge + Pages (`index.html` + `js/eiel-forms.js?v=20260803b`).
4. Hard refresh; cerrar sesión y entrar.

### Login

Flujo simple otra vez: un POST, sin warmup ni timeouts raros.
Sigue la caché 2 min de credenciales y, con `MASTER_PASS`, no abre la hoja.

### Nota de seguridad

Sin token, cualquiera que conozca las URLs de Adjuntos/PDF podría
invocarlas. Es un trade-off consciente (gratis + rápido). Se puede
reactivar el token más adelante o mover el login a un Worker gratuito.

---

## A + B — Adjuntos (`adjuntos.gs`)

- Validación, límite 35 MB, JSON legible
- `setSharing` no bloqueante
- Mensajes de error en español para el técnico
- Front sin `no-cors`; exige `status === "success"`

## C — PDF (`generar-pdf.gs`)

- JSON `{ status, success, message }`
- Mensajes de error amigables (Gmail, cuota, sesión, adjuntos…)
- Front sin `no-cors`; interpreta `status` o `success`
- **Verificación de adjuntos en Drive** antes de generar PDF/email:
  si hay nombres declarados (`lista_archivos` array o `archivos_adjuntos`
  por líneas), comprueba la carpeta
  `adjuntos/[muni]/[id_envio|id_registro]/…` con varios reintentos.
  - Los nombres **no se parten por comas** (un PDF «Informe, final.pdf»
    es un solo fichero).
  - Match normalizado (+/espacios, mayúsculas, caracteres raros).
  - Si tras reintentos los nombres no cuadran al 100 % pero la carpeta
    **tiene ficheros** (conteo ≥ declarados, o al menos no vacía tras
    subida OK del cliente) → **se genera el PDF y el envío es OK**
    (aviso solo en el log de Apps Script). Solo falla si la carpeta no
    existe o está vacía.

### Despliegue PDF
1. Pegar `generar-pdf.gs` → **Nueva versión** (misma app web).
2. Publicar también `docs/js/eiel-forms.js` (envía `lista_archivos` como
   array JSON).
3. Probar envío con adjunto (idealmente nombre con coma) → OK.
4. Prueba negativa (opcional): carpeta de adjuntos vacía → mensaje de
   adjuntos faltantes.

## E — Logger de accesos (`logger.gs`)

- Front sin `no-cors`; lee `{ status }`
- Si falla: solo `console.warn` (no bloquea el formulario)
- Código municipio con ceros (`'006`)
- Ver `logger.PARCHE.md`

## F — Hoja `logs_errores` (`log-errores.gs`)

Ahora Adjuntos y PDF escriben fallos en **`logs_errores`** (misma hoja
de cálculo que `logs_envios` / `logs_acceso`).

Columnas: Fecha, Origen (`adjuntos`/`pdf`), Municipio, Código, Tipo,
id_envio, id_registro, Usuario, Archivo, Mensaje usuario, Detalle técnico.

### Despliegue
1. En **Adjuntos** y **PDF**: crear/actualizar fichero `log-errores` con
   `appscript/log-errores.gs` (junto a `Código.gs` y `auth-token.gs`).
2. En el editor de **Adjuntos**: función `testLogErrores` → Ejecutar →
   aceptar permisos de Hojas de cálculo. Debe crear una fila
   `origen=test` en `logs_errores`.
3. Repetir `testLogErrores` en el proyecto **PDF**.
4. Actualizar `Código.gs` (`adjuntos.gs` / `generar-pdf.gs`) y
   **Implementar → Nueva versión** en ambos.
5. Probar: token inválido e intentar subir → fila con origen `adjuntos`.

Si el error se ve en pantalla pero no hay fila: falta el fichero
`log-errores`, faltan permisos sobre la hoja, o no se redesplegó.

## Nota DriveApp / setSharing

En muchos Workspace, `ANYONE_WITH_LINK` está bloqueado. El flujo EIEL no
necesita enlace público.
