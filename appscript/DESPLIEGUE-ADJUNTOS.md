# Despliegue Adjuntos (imprescindible)

El portal de Pages **no actualiza** Google Apps Script. Tras cada cambio en
`appscript/adjuntos.gs` hay que pegarlo a mano.

**Sin este paso**, el navegador muestra:

> El Web App de Adjuntos no reconoce action=check

y las fotos fallan con HTML 404 / CORS aunque la compresión del front funcione.

## Pasos

1. Abrir el proyecto Apps Script de **Adjuntos** (el de `URL_ADJUNTOS` /
   `urlAdjuntos` en los HTML, hoy
   `.../macros/s/AKfycbx-U74VO-zvLbuCDWZo5c56NctsOUjVhOyqJA7cGfN0Ai2-G_cfemaxxr3zNhmIfu_Suw/exec`).
2. Sustituir el contenido de `Código.gs` por el de `appscript/adjuntos.gs` del
   repo (**completo**). Mantenga también `auth-token.gs` y `log-errores.gs` en
   el mismo proyecto si ya estaban.
3. **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar.**
   - No crear una implementación nueva (cambiaría la URL).
4. Comprobar: Ejecutar como *Yo*; Quién tiene acceso: *Cualquiera*.
5. Hard refresh del portal (`Ctrl+Shift+R`).

## Cómo saber si está bien

### A) Ping (GET)

```bash
curl -sL "$URL_ADJUNTOS?action=ping"
```

Esperado: `{"status":"success","supports_check":true,"version":"adjuntos-20260805c",...}`

Si dice `Script function not found: doGet`, la versión desplegada es antigua o
el fichero pegado no incluye `doGet`.

### B) Check (POST, igual que el portal)

```bash
curl -sL -X POST "$URL_ADJUNTOS" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"check","filename":"x.jpg","municipio":"005","seccion":"GENERAL","id_envio":"ENVIO_TEST"}'
```

| Respuesta | Significado |
|-----------|-------------|
| `{"status":"missing",...}` o `success` | **OK** — versión nueva |
| `«Faltan datos necesarios…»` | **NO desplegado** — sigue el script viejo |
| HTML 404 / Page Not Found | Fallo puntual de Apps Script; reintentar |

En la consola del navegador, tras un fallo opaco, **no** debe aparecer el aviso
de `action=check`. Si aparece, o el portal aborta al guardar con el mensaje de
despliegue, vuelva al paso 1.

## Paralelo (v 20260805c+)

El portal sube hasta **3 adjuntos a la vez**. El script usa candado **por fichero**
(no global). Tras pegar esta versión, publique **Nueva versión** o el candado
viejo serializará de nuevo todas las subidas.
