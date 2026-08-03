// ====================================================================
// SCRIPT DE LOGIN
// ====================================================================
// Requiere el fichero auth-token.gs en el MISMO proyecto
// (issueSessionToken_ / assertValidSessionToken_).
// Tras pegar: Implementar → Nueva versión.
//
// Optimización: CacheService de la hoja de credenciales (~2 min) para
// evitar releer SpreadsheetApp en cada login (cold start + latencia).
// Con MASTER_PASS no se abre la hoja: el nombre lo resuelve el portal.
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
 * @return {Array<Array>}
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
  // Guardamos solo filas de datos (sin cabecera) como texto
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    rows.push([
      String(values[i][0] != null ? values[i][0] : "").trim(),
      String(values[i][1] != null ? values[i][1] : "").trim(),
      String(values[i][2] != null ? values[i][2] : "").trim()
    ]);
  }

  try {
    // CacheService límite ~100 KB; credenciales de municipios caben sobrado
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

    // Warmup del portal (no es un login real): despierta + precarga caché.
    if (codigoInput === "__warmup__" || data.warmup === true) {
      try {
        loadCredencialesRows_();
      } catch (ignore) {}
      return jsonLogin_({
        success: true,
        valid: false,
        warmup: true,
        nombre: "",
        isTest: false,
        token: ""
      });
    }

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

    var token = "";
    if (loginExitoso) {
      if (typeof issueSessionToken_ !== "function") {
        return jsonLogin_({
          success: false,
          message: "Falta auth-token.gs en el proyecto Login."
        });
      }
      token = issueSessionToken_(codigoInput, isTestMode);
    }

    return jsonLogin_({
      success: true,
      valid: loginExitoso,
      nombre: nombreMunicipio,
      isTest: isTestMode,
      token: token
    });
  } catch (error) {
    return jsonLogin_({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Wake-up al abrir el portal (GET). Despierta el contenedor y precarga
 * la caché de credenciales para que el POST de login sea rápido.
 */
function doGet(e) {
  try {
    loadCredencialesRows_();
  } catch (ignore) {}
  return jsonLogin_({ ok: true, pong: true });
}

/**
 * Ejecutar desde el editor tras cambiar claves en la hoja, si hace falta
 * invalidar la caché antes de los 2 minutos.
 */
function clearCredencialesCache() {
  CacheService.getScriptCache().remove(CACHE_CREDENCIALES_KEY);
  Logger.log("Caché de credenciales borrada");
}
