// ====================================================================
// SCRIPT DE LOGIN (sin token de sesión — modo rápido)
// ====================================================================
// Tokens desactivados temporalmente para recuperar la fiabilidad del
// login en Apps Script. Adjuntos/PDF no exigen session_token.
//
// Tras pegar: Implementar → Nueva versión (misma app web).
// auth-token.gs puede quedarse en el proyecto, pero no es obligatorio.
// ====================================================================

const ID_HOJA_CREDENCIALES = "1MtFPW_FDMCKaAnMeYRCyr-qnTIyUUOrSOK5N7cj6Hu8";
const NOMBRE_PESTANA = "Hoja 1";
const CACHE_CREDENCIALES_KEY = "eiel_creds_v1";
const CACHE_CREDENCIALES_TTL_SEC = 120;

function jsonLogin_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Filas [codigo, clave, nombre] desde caché o hoja.
 */
function loadCredencialesRows_() {
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get(CACHE_CREDENCIALES_KEY);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.length) return parsed;
    }
  } catch (ignore) {}

  var ss = SpreadsheetApp.openById(ID_HOJA_CREDENCIALES);
  var sheet = ss.getSheetByName(NOMBRE_PESTANA) || ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    rows.push([
      String(values[i][0] != null ? values[i][0] : "").trim(),
      String(values[i][1] != null ? values[i][1] : "").trim(),
      String(values[i][2] != null ? values[i][2] : "").trim()
    ]);
  }

  try {
    cache.put(CACHE_CREDENCIALES_KEY, JSON.stringify(rows), CACHE_CREDENCIALES_TTL_SEC);
  } catch (ignore) {}

  return rows;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonLogin_({
        success: false,
        message: "No se recibieron datos de acceso."
      });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonLogin_({
        success: false,
        message: "Petición de acceso no válida."
      });
    }

    var codigoInput = String(data.codigo || "").trim();
    var passwordInput = String(data.password || "").trim();

    var MASTER_PASS = PropertiesService.getScriptProperties().getProperty("MASTER_PASS");

    var loginExitoso = false;
    var nombreMunicipio = "";
    var isTestMode = false;

    // Contraseña maestra: no abrimos la hoja (el front ya tiene el nombre).
    if (MASTER_PASS && passwordInput == MASTER_PASS) {
      loginExitoso = true;
      isTestMode = true;
      nombreMunicipio = "";
    } else {
      var rows = loadCredencialesRows_();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0] === codigoInput && rows[i][1] === passwordInput) {
          loginExitoso = true;
          nombreMunicipio = rows[i][2];
          isTestMode = false;
          break;
        }
      }
    }

    return jsonLogin_({
      success: true,
      valid: loginExitoso,
      nombre: nombreMunicipio,
      isTest: isTestMode
    });
  } catch (error) {
    return jsonLogin_({
      success: false,
      message: error.toString()
    });
  }
}

function clearCredencialesCache() {
  CacheService.getScriptCache().remove(CACHE_CREDENCIALES_KEY);
  Logger.log("Caché de credenciales borrada");
}
