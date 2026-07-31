// ====================================================================
// EIEL — Registro de errores en hoja "logs_errores"
// ====================================================================
// Pegar como fichero adicional en los proyectos:
//   - Adjuntos
//   - Generar PDF
// (Misma hoja de cálculo que logs_envios / logs_acceso)
// ====================================================================

var EIEL_ID_HOJA_ERRORES = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM";
var EIEL_PESTANA_ERRORES = "logs_errores";

/**
 * Escribe una fila en logs_errores. Nunca lanza (no debe tumbar el flujo).
 *
 * @param {Object} info
 * @param {string} info.origen - "adjuntos" | "pdf" | ...
 * @param {string} [info.municipio]
 * @param {string} [info.codigo]
 * @param {string} [info.tipo]
 * @param {string} [info.id_envio]
 * @param {string} [info.id_registro]
 * @param {string} [info.usuario]
 * @param {string} [info.mensaje_usuario] - texto mostrado al técnico
 * @param {string} [info.detalle] - error técnico / stack corto
 * @param {string} [info.archivo] - nombre fichero (adjuntos)
 */
function logErrorToSheet_(info) {
  try {
    info = info || {};
    var ss = SpreadsheetApp.openById(EIEL_ID_HOJA_ERRORES);
    var sheet = ss.getSheetByName(EIEL_PESTANA_ERRORES);

    if (!sheet) {
      sheet = ss.insertSheet(EIEL_PESTANA_ERRORES);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Fecha",
        "Origen",
        "Municipio",
        "Código",
        "Tipo",
        "id_envio",
        "id_registro",
        "Usuario",
        "Archivo",
        "Mensaje usuario",
        "Detalle técnico"
      ]);
      sheet.getRange(1, 1, 1, 11).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    var codigo = String(info.codigo || "").trim();
    var codigoTxt = codigo.replace(/\D/g, "");
    if (codigoTxt.length > 0 && codigoTxt.length < 3) {
      while (codigoTxt.length < 3) codigoTxt = "0" + codigoTxt;
    } else if (codigoTxt.length > 3) {
      codigoTxt = codigoTxt.slice(-3);
    }
    if (!codigoTxt) codigoTxt = codigo;

    var detalle = String(info.detalle || "");
    if (detalle.length > 1500) detalle = detalle.substring(0, 1500) + "…";

    sheet.appendRow([
      new Date(),
      info.origen || "",
      info.municipio || "",
      codigoTxt ? "'" + codigoTxt : "",
      info.tipo || "",
      info.id_envio || "",
      info.id_registro || "",
      info.usuario || "",
      info.archivo || "",
      info.mensaje_usuario || "",
      detalle
    ]);
  } catch (e) {
    try {
      Logger.log("logErrorToSheet_ falló: " + e.toString());
    } catch (ignore) {}
  }
}
