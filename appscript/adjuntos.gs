// --------------------------------------------------------------------
// SCRIPT DE ADJUNTOS (DRIVE) — validación, token de sesión, JSON legible
// Pegar en URL_ADJUNTOS + fichero auth-token.gs en el MISMO proyecto.
// Tras pegar: Implementar → Nueva versión.
//
// Prueba forzada: nombre de archivo que empiece por FORZAR_ERROR
// --------------------------------------------------------------------

const CARPETA_RAIZ_ID = "1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV";
const LIMITE_BYTES = 35 * 1024 * 1024;

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  // Envoltorio exterior: si algo revienta sin catch, igual intentamos JSON
  // (si no, Google devuelve HTML sin CORS → "Failed to fetch" en el navegador).
  try {
    return handleAdjuntosPost_(e);
  } catch (fatal) {
    Logger.log("FATAL ADJUNTOS: " + fatal.toString());
    try {
      Logger.log("FATAL stack: " + (fatal.stack || ""));
    } catch (ignore) {}
    return jsonOut_({
      status: "error",
      message: "Error interno adjuntos: " + fatal.toString()
    });
  }
}

function handleAdjuntosPost_(e) {
  const result = { status: "error", message: "" };

  try {
    if (!e) throw new Error("No hay datos de entrada.");

    if (typeof assertValidSessionToken_ !== "function") {
      throw new Error(
        "Falta auth-token.gs en el proyecto Adjuntos (assertValidSessionToken_ no definida)."
      );
    }

    var data = {};
    var rawLen = 0;
    if (e.postData && e.postData.contents) {
      rawLen = String(e.postData.contents).length;
      if (isJson(e.postData.contents)) {
        data = JSON.parse(e.postData.contents);
      } else {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    const munCodeFull = (data.municipio || data.mun || "").toString().trim();
    const munCode = munCodeFull ? munCodeFull.slice(-3) : "";
    const tipo = (data.tipo || data.tipo_ficha || "general").toLowerCase();
    const seccion = data.seccion || "DOCUMENTACION";
    const idEnvio = (data.id_envio || "").toString().trim();
    const base64Data = data.bytesBase64;
    const mimeType = data.mimeType || "application/octet-stream";
    const fileName = (data.filename || data.nombre_archivo || "").toString().trim();
    const usuario = (data.usuario || "anonimo").toString();
    const sessionToken = data.session_token || data.token || "";

    Logger.log(
      "[ADJUNTOS] start mun=" +
        munCode +
        " file=" +
        fileName +
        " rawLen=" +
        rawLen +
        " tokenLen=" +
        String(sessionToken).length
    );

    if (!munCode) throw new Error("Falta el código de municipio.");
    assertValidSessionToken_(sessionToken, munCode);
    if (!idEnvio) throw new Error("Falta id_envio.");
    if (!fileName) throw new Error("Falta el nombre del archivo.");
    if (!base64Data) throw new Error("Falta el contenido del archivo (bytesBase64).");

    if (fileName.indexOf("FORZAR_ERROR") === 0) {
      throw new Error("Error de prueba forzado (FORZAR_ERROR).");
    }

    const approxBytes = Math.floor((String(base64Data).length * 3) / 4);
    if (approxBytes > LIMITE_BYTES) {
      throw new Error(
        'El archivo "' +
          fileName +
          '" supera el límite de 35 MB (' +
          Math.round(approxBytes / (1024 * 1024)) +
          " MB)."
      );
    }

    const carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
    const carpetaMun = getOrCreateFolder(carpetaRaiz, munCode);
    const carpetaExpediente = getOrCreateFolder(carpetaMun, idEnvio);

    let carpetaDestino;
    if (
      idEnvio.indexOf("-E-") !== -1 ||
      idEnvio.indexOf("_E_") !== -1 ||
      idEnvio.indexOf("EXP_E") === 0
    ) {
      carpetaDestino = carpetaExpediente;
    } else {
      carpetaDestino = getOrCreateFolder(carpetaExpediente, seccion);
    }

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );
    const realBytes = blob.getBytes().length;
    if (realBytes > LIMITE_BYTES) {
      throw new Error(
        'El archivo "' + fileName + '" supera el límite de 35 MB tras decodificar.'
      );
    }

    const file = carpetaDestino.createFile(blob);

    let sharingOk = false;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sharingOk = true;
    } catch (shareErr) {
      Logger.log(
        "[ADJUNTOS] setSharing omitido (política Workspace?): " + shareErr.toString()
      );
    }

    result.status = "success";
    result.fileId = file.getId();
    result.url = file.getUrl();
    result.message = sharingOk
      ? "Archivo subido correctamente."
      : "Archivo subido correctamente (sin enlace público; política de Drive).";
    result.filename = fileName;
    result.bytes = realBytes;
    result.sharing = sharingOk;

    Logger.log(
      "[ADJUNTOS OK] mun=" +
        munCode +
        " id_envio=" +
        idEnvio +
        " seccion=" +
        seccion +
        " tipo=" +
        tipo +
        " file=" +
        fileName +
        " bytes=" +
        realBytes +
        " user=" +
        usuario
    );
  } catch (error) {
    result.status = "error";
    result.message = error.toString();
    Logger.log("ERROR SUBIDA: " + error.toString());
    try {
      Logger.log("ERROR stack: " + (error.stack || "(sin stack)"));
    } catch (ignore) {}
    // No loguear e.postData.contents: el Base64 puede ser enorme y tumbar la ejecución.
  }

  return jsonOut_(result);
}

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function getOrCreateFolder(parent, name) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
    return parent.createFolder(name);
  } finally {
    lock.releaseLock();
  }
}

function testPermisos() {
  GmailApp.getAliases();
  console.log("Permisos Gmail concedidos");
}

/**
 * Ejecutar desde el editor de Adjuntos (no desde la web).
 * Comprueba que auth-token.gs está cargado y que emitir/validar token funciona.
 */
function testAuthAdjuntos() {
  Logger.log("typeof assertValidSessionToken_ = " + typeof assertValidSessionToken_);
  Logger.log("typeof issueSessionToken_ = " + typeof issueSessionToken_);
  if (typeof issueSessionToken_ !== "function") {
    throw new Error("Falta auth-token.gs (issueSessionToken_ no definida)");
  }
  var t = issueSessionToken_("001", true);
  Logger.log("token sample len=" + t.length);
  var data = assertValidSessionToken_(t, "001");
  Logger.log("assert OK: " + JSON.stringify(data));
  Logger.log("testAuthAdjuntos terminado");
}

/**
 * Prueba real de Drive: lectura de carpeta + creación + intento de compartir.
 */
function testDrivePermisos() {
  const carpeta = DriveApp.getFolderById(CARPETA_RAIZ_ID);
  Logger.log("Carpeta OK: " + carpeta.getName());

  const blob = Utilities.newBlob("prueba eiel", "text/plain", "test_drive_eiel.txt");
  const file = carpeta.createFile(blob);
  Logger.log("createFile OK: " + file.getId());

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log("setSharing OK (enlace público permitido)");
  } catch (e) {
    Logger.log("setSharing DENEGADO (esperado en muchos Workspace): " + e.toString());
  }

  try {
    file.setTrashed(true);
  } catch (ignore) {}

  Logger.log("testDrivePermisos terminado");
}
