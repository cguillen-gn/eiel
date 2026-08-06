// ====================================================================
// EIEL — Registro de errores en hoja "logs_errores" / "logs_errores_pruebas"
// ====================================================================
// Pegar como fichero adicional en los proyectos:
//   - Adjuntos
//   - Generar PDF
// (Misma hoja de cálculo que logs_envios / logs_acceso)
//
// Si info.is_test (o municipio con «PRUEBAS») → logs_errores_pruebas.
//
// Tras pegar: autorizar SpreadsheetApp (Ejecutar testLogErrores una vez)
// y luego Implementar → Nueva versión en la app web.
// ====================================================================

var EIEL_ID_HOJA_ERRORES = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM";
var EIEL_PESTANA_ERRORES = "logs_errores";
var EIEL_PESTANA_ERRORES_PRUEBAS = "logs_errores_pruebas";
/** Marcador de despliegue (mismo valor que PDF/Logger). */
var EIEL_BUILD_ERRORES = "logs-split-20260806";

/** ¿Va a la pestaña de pruebas? */
function esErrorPrueba_(info) {
  info = info || {};
  var flag = info.is_test;
  if (flag === true || flag === "true" || flag === 1 || flag === "1") return true;
  if (String(info.municipio || "").indexOf("PRUEBAS") !== -1) return true;
  if (String(info.id_registro || "").indexOf("TEST-") === 0) return true;
  return false;
}

function pestanaErrores_(info) {
  return esErrorPrueba_(info)
    ? EIEL_PESTANA_ERRORES_PRUEBAS
    : EIEL_PESTANA_ERRORES;
}

/**
 * Escribe una fila en logs_errores(_pruebas). Nunca lanza (no debe tumbar el flujo).
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
 * @param {boolean|string} [info.is_test] - modo prueba del portal
 * @return {boolean} true si escribió la fila
 */
function logErrorToSheet_(info) {
  try {
    info = info || {};
    var pestana = pestanaErrores_(info);
    var ss = SpreadsheetApp.openById(EIEL_ID_HOJA_ERRORES);
    var sheet = ss.getSheetByName(pestana);

    if (!sheet) {
      sheet = ss.insertSheet(pestana);
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
    Logger.log(
      "[logs_errores OK] pestana=" +
        pestana +
        " origen=" +
        (info.origen || "") +
        " codigo=" +
        codigoTxt +
        " archivo=" +
        (info.archivo || "")
    );
    return true;
  } catch (e) {
    try {
      Logger.log("logErrorToSheet_ falló: " + e.toString());
      if (e && e.stack) Logger.log("logErrorToSheet_ stack: " + e.stack);
    } catch (ignore) {}
    return false;
  }
}

/**
 * Ejecutar desde el editor (Adjuntos o PDF) para autorizar y comprobar escritura.
 * Escribe en logs_errores_pruebas (is_test).
 */
function testLogErrores() {
  Logger.log("typeof logErrorToSheet_ = " + typeof logErrorToSheet_);
  var ok = logErrorToSheet_({
    origen: "test",
    municipio: "(PRUEBAS) EDITOR",
    codigo: "001",
    tipo: "test",
    id_envio: "TEST_LOG_ERRORES",
    usuario: Session.getActiveUser().getEmail() || "editor",
    archivo: "",
    mensaje_usuario: "Fila de prueba desde testLogErrores()",
    detalle:
      "Si ves esta fila, SpreadsheetApp y la pestaña logs_errores_pruebas están OK.",
    is_test: true
  });
  if (!ok) {
    throw new Error(
      "No se pudo escribir en logs_errores_pruebas. Revisa permisos de la hoja " +
        EIEL_ID_HOJA_ERRORES +
        " y que exista la pestaña '" +
        EIEL_PESTANA_ERRORES_PRUEBAS +
        "'."
    );
  }
  Logger.log(
    "testLogErrores terminado OK — revisa la hoja " + EIEL_PESTANA_ERRORES_PRUEBAS
  );
}
