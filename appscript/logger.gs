// ====================================================================
// SCRIPT LOGGER DE ACCESOS (logs_acceso)
// ====================================================================
// Pegar en el proyecto Apps Script de URL_LOGGER y redesplegar
// una NUEVA VERSIÓN (Yo + Cualquiera).
//
// Contrato: { status: "success"|"error", message: string }
// El front solo hace console.warn si falla; no bloquea al usuario.
//
// Si tu hoja usa otro ID o nombre de pestaña, cámbialos abajo.
// ====================================================================

const ID_HOJA_LOGS = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM";
const NOMBRE_PESTANA_ACCESOS = "logs_acceso";

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    return handleLoggerPost_(e);
  } catch (fatal) {
    Logger.log("FATAL LOGGER: " + fatal.toString());
    return jsonOut_({
      status: "error",
      message: "Error interno logger: " + fatal.toString()
    });
  }
}

function handleLoggerPost_(e) {
  const result = { status: "error", message: "" };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibieron datos.");
    }

    var data = {};
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = e.parameter || {};
    }

    const fila = [
      new Date(),
      data.municipio || "",
      data.codigo || "",
      data.fase || "",
      data.tipo || "",
      data.contacto || "",
      data.departamento || "",
      data.email || "",
      data.ua || ""
    ];

    const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
    let sheet = ss.getSheetByName(NOMBRE_PESTANA_ACCESOS);

    if (!sheet) {
      sheet = ss.insertSheet(NOMBRE_PESTANA_ACCESOS);
      sheet.appendRow([
        "Fecha",
        "Municipio",
        "Código",
        "Fase",
        "Tipo",
        "Contacto",
        "Departamento",
        "Email",
        "User-Agent"
      ]);
      sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow(fila);

    result.status = "success";
    result.message = "Acceso registrado.";
  } catch (error) {
    result.status = "error";
    result.message = error.toString();
    Logger.log("ERROR LOGGER: " + error.toString());
  }

  return jsonOut_(result);
}
