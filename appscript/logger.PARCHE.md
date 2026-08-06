# Logger — accesos + estados de envío (menú)

## Front (`index.html`)
Tras el login, el menú consulta:

`GET URL_LOGGER?action=estados_envio&codigo=006&fase=2026`

y marca los botones con *Enviado (fecha) · pendiente revisar por Geonet*.

Si la consulta falla, el menú se comporta como antes (sin badges).
Para apagar el experimento en el HTML: `MENU_ESTADOS_ENVIO = false`.

## Apps Script (obligatorio para ver badges)

1. Abrir proyecto **URL_LOGGER**
2. Sustituir `Código.gs` por `appscript/logger.gs` del repo
3. Revisar `ID_HOJA_LOGS` (misma hoja que `logs_envios` / `logs_acceso`)
4. **Administrar implementaciones → editar existente → Nueva versión**
   (Yo + Cualquiera; no crear URL nueva)
5. Comprobar:
   ```bash
   curl -sL "$URL_LOGGER?action=ping"
   # → supports_estados_envio: true, version: logger-20260806a
   curl -sL "$URL_LOGGER?action=estados_envio&codigo=006&fase=2026"
   ```

## Notas
- Envíos `TEST-…` solo se muestran si el técnico entró en modo pruebas.
- El botón sigue clicable (se puede reenviar).
- Caché de 2 min en `sessionStorage` para no martillear Apps Script.
