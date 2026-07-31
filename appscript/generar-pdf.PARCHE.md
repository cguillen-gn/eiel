# Parche C — Respuesta legible en Generar PDF

El front (`sendPdfPayload`) ya lee JSON como en adjuntos. Hasta que
apliques este parche, sigue siendo compatible con el script antiguo
(si no hay `{ status }`, no bloquea).

## Contrato de respuesta

```json
{ "status": "success"|"error", "message": "..." }
```

## Qué hacer en el proyecto Apps Script de URL_GENERAR_PDF

1. Envuelve **todo** el cuerpo de `doPost` en try/catch.
2. Al final del éxito: `result.status = "success"`.
3. En el catch: `result.status = "error"` + `result.message`.
4. **Siempre** devolver:

```javascript
return ContentService
  .createTextOutput(JSON.stringify(result))
  .setMimeType(ContentService.MimeType.JSON);
```

5. Elimina el bloque muerto con `URL_DE_TU_SCRIPT_ADJUNTOS` si sigue ahí
   (no aporta y puede confundir).
6. Si usas `setSharing(ANYONE_WITH_LINK)`, envuélvelo en try/catch como en
   `adjuntos.gs` (misma política Workspace).
7. Implementar → **Nueva versión** (Yo + Cualquiera).

## Esqueleto (pegar la lógica actual dentro del try)

```javascript
function doPost(e) {
  const result = { status: "error", message: "" };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No hay datos de entrada.");
    }

    const data = JSON.parse(e.postData.contents);

    // Gancho de prueba opcional (contact name = FORZAR_ERROR)
    if ((data.nombre_contacto || "") === "FORZAR_ERROR") {
      throw new Error("Error de prueba forzado (FORZAR_ERROR).");
    }

    // --- AQUÍ tu lógica actual ---
    // (hoja de logs, renombrar carpeta ENVIO_*, generar PDF, email)
    // Sustituye cualquier `return HtmlService...` por asignar success al final.

    result.status = "success";
    result.message = "PDF generado y enviado.";
  } catch (err) {
    result.status = "error";
    result.message = err.toString();
    Logger.log("[PDF ERROR] " + err.toString());
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Prueba

1. Envío normal → éxito + email PDF (como ahora).
2. Temporalmente: pon `nombre_contacto` = `FORZAR_ERROR` (o el gancho que
   hayas pegado) → el front debe mostrar error y **no** la pantalla de éxito.

## Nota

Si pegas aquí el script completo de Generar PDF, se puede dejar versionado
en `appscript/generar-pdf.gs` listo para copiar/pegar (igual que adjuntos).
