# Apps Script — Adjuntos, PDF, token y logger

## D — Token de sesión en el envío

Sin token, cualquiera con la URL del Web App podía subir adjuntos o
disparar el PDF. Ahora el login emite un token HMAC; adjuntos y PDF lo exigen.

| Pieza | Archivo |
|-------|---------|
| Helpers HMAC (compartidos) | `auth-token.gs` |
| Login | `login.gs` / `login.PARCHE.md` |
| Adjuntos | `adjuntos.gs` + `log-errores.gs` |
| PDF | `generar-pdf.gs` + `log-errores.gs` |
| Front | `js/eiel-forms.js` + plantillas index/base |

### Despliegue (orden)

1. **Login:** `auth-token.gs` + `login.gs` → **Nueva versión**
2. **Front:** merge + regenerar
3. **Adjuntos y PDF:** mismo `auth-token.gs` + scripts → **Nueva versión**
4. Cerrar sesión y volver a entrar

### Secreto

Mismo `EIEL_TOKEN_SECRET` (Script Properties) o el mismo fallback en
`auth-token.gs` en Login, Adjuntos y PDF.

### Pruebas

1. Login → menú OK  
2. Envío con adjunto → OK  
3. Sin token (borrar `eiel_session_token`) → redirect / error de sesión  

### Login lento / “Error de conexión”

Apps Script a veces tarda en el **primer** uso tras inactividad (cold start).
Los reintentos automáticos encadenados empeoran la espera (p. ej. 75 s).

Enfoque actual:
- Al abrir el portal se hace un **POST de warmup** (`codigo=__warmup__`)
  en segundo plano (no GET: si falta `doGet` Google responde HTML sin CORS).
- El botón Entrar hace **un solo POST** con timeout de 25 s.
- Si falla: mensaje para pulsar Entrar otra vez (el 2º clic suele ser rápido).
- Caché 2 min de credenciales; con `MASTER_PASS` no se abre la hoja.
- `doGet` sigue existiendo como respaldo, pero el portal ya no depende de él.

Tras actualizar: pegar `login.gs` → **Nueva versión** (misma implementación,
no crear otra) + publicar `docs/index.html`.

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
  si `lista_archivos` no está vacía, debe existir cada fichero bajo
  `adjuntos/[muni]/[id_envio|id_registro]/…`. Si falta alguno → error
  (y fila en `logs_errores`), sin enviar el justificante.

### Despliegue PDF
1. Pegar `generar-pdf.gs` → **Nueva versión** (misma app web).
2. Probar envío con adjunto → OK.
3. Prueba negativa (opcional): manipular `lista_archivos` o borrar el
   fichero en Drive antes del PDF → mensaje de adjuntos faltantes.

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
