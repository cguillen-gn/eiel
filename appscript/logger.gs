// ====================================================================
// SCRIPT LOGGER DE ACCESOS (logs_acceso / logs_acceso_pruebas)
// ====================================================================
// Pegar en el proyecto Apps Script de URL_LOGGER y redesplegar
// una NUEVA VERSIÓN (Yo + Cualquiera).
//
// Contrato: { status: "success"|"error", message: string }
// El front solo hace console.warn si falla; no bloquea al usuario.
//
// Si is_test (o municipio con «PRUEBAS») → pestaña logs_acceso_pruebas.
// Si tu hoja usa otro ID o nombre de pestaña, cámbialos abajo.
// ====================================================================

const ID_HOJA_LOGS = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM";
const NOMBRE_PESTANA_ACCESOS = "logs_acceso";
const NOMBRE_PESTANA_ACCESOS_PRUEBAS = "logs_acceso_pruebas";

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Acceso de prueba: flag del portal o prefijo (PRUEBAS) en municipio. */
function esAccesoPrueba_(data) {
  data = data || {};
  if (data.is_test === true || data.is_test === "true") return true;
  return String(data.municipio || "").indexOf("PRUEBAS") !== -1;
}

function pestanaAccesos_(esPrueba) {
  return esPrueba ? NOMBRE_PESTANA_ACCESOS_PRUEBAS : NOMBRE_PESTANA_ACCESOS;
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

    // Forzar texto con ceros a la izquierda (Sheets convierte "006" → 6)
    var codigoRaw = String(data.codigo || "").trim();
    var codigoTxt = codigoRaw.replace(/\D/g, "");
    if (codigoTxt.length > 0 && codigoTxt.length < 3) {
      while (codigoTxt.length < 3) codigoTxt = "0" + codigoTxt;
    } else if (codigoTxt.length > 3) {
      codigoTxt = codigoTxt.slice(-3);
    }
    if (!codigoTxt) codigoTxt = codigoRaw;

    const fila = [
      new Date(),
      data.municipio || "",
      "'" + codigoTxt,
      data.fase || "",
      data.tipo || "",
      data.contacto || "",
      data.departamento || "",
      data.email || "",
      data.ua || ""
    ];

    const esPrueba = esAccesoPrueba_(data);
    const pestana = pestanaAccesos_(esPrueba);

    const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
    let sheet = ss.getSheetByName(pestana);

    if (!sheet) {
      sheet = ss.insertSheet(pestana);
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
    result.message = esPrueba
      ? "Acceso de prueba registrado."
      : "Acceso registrado.";
  } catch (error) {
    result.status = "error";
    result.message = error.toString();
    Logger.log("ERROR LOGGER: " + error.toString());
  }

  return jsonOut_(result);
}
