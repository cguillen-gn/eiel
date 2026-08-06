// ====================================================================
// Exportar credenciales de login → JSON para el Worker (KV)
// ====================================================================
// Pegar en un proyecto Apps Script con acceso a la hoja de credenciales
// (puede ser el mismo de login.gs). Ejecutar exportCredencialesJson()
// desde el editor y copiar el resultado del registro / fichero Drive.
//
// Formato de salida (clave KV "credenciales"):
//   { "006": { "clave": "...", "nombre": "Alcalalí" }, ... }
// ====================================================================

const ID_HOJA_CREDENCIALES = "1MtFPW_FDMCKaAnMeYRCyr-qnTIyUUOrSOK5N7cj6Hu8";
const NOMBRE_PESTANA = "Hoja 1"; // o null → primera hoja

/**
 * Escribe el JSON en el log y crea un fichero en Drive (raíz).
 */
function exportCredencialesJson() {
  const ss = SpreadsheetApp.openById(ID_HOJA_CREDENCIALES);
  const sheet = NOMBRE_PESTANA
    ? ss.getSheetByName(NOMBRE_PESTANA)
    : ss.getSheets()[0];
  if (!sheet) throw new Error("No se encontró la hoja de credenciales.");

  const values = sheet.getDataRange().getValues();
  const out = {};
  for (var i = 1; i < values.length; i++) {
    var code = String(values[i][0] == null ? "" : values[i][0]).trim();
    if (!code) continue;
    out[code] = {
      clave: String(values[i][1] == null ? "" : values[i][1]).trim(),
      nombre: String(values[i][2] == null ? "" : values[i][2]).trim()
    };
  }

  const json = JSON.stringify(out);
  Logger.log("Municipios exportados: " + Object.keys(out).length);
  Logger.log(json);

  const file = DriveApp.createFile(
    "eiel-credenciales-login-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmm") + ".json",
    json,
    MimeType.PLAIN_TEXT
  );
  Logger.log("Fichero Drive: " + file.getUrl());
  return { count: Object.keys(out).length, fileUrl: file.getUrl() };
}
