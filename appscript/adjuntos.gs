// --------------------------------------------------------------------
// SCRIPT DE ADJUNTOS (DRIVE) — versión con validación y respuesta legible
// Pegar en el proyecto Apps Script de URL_ADJUNTOS y redesplegar /exec
// --------------------------------------------------------------------
//
// Prueba de fallo forzado: subir un archivo cuyo nombre empiece por
// "FORZAR_ERROR" (ej: FORZAR_ERROR_prueba.pdf). Debe devolver status=error.
// --------------------------------------------------------------------

const CARPETA_RAIZ_ID = "1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV";
const LIMITE_BYTES = 35 * 1024 * 1024; // Alineado con el front (~Base64 / límite Drive)

function doPost(e) {
  const result = { status: "error", message: "", logs: [] };

  try {
    if (!e) throw new Error("No hay datos de entrada.");

    // 1. LECTURA DE DATOS (JSON o formulario)
    var data = {};
    if (e.postData && e.postData.contents && isJson(e.postData.contents)) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter || {};
    }

    // 2. EXTRACCIÓN Y LIMPIEZA
    const munCodeFull = (data.municipio || data.mun || "").toString().trim();
    const munCode = munCodeFull ? munCodeFull.slice(-3) : "";
    const tipo = (data.tipo || data.tipo_ficha || "general").toLowerCase();
    const seccion = data.seccion || "DOCUMENTACION";
    const idEnvio = (data.id_envio || "").toString().trim();
    const base64Data = data.bytesBase64;
    const mimeType = data.mimeType || "application/octet-stream";
    const fileName = (data.filename || data.nombre_archivo || "").toString().trim();
    const usuario = (data.usuario || "anonimo").toString();

    // 3. VALIDACIÓN TEMPRANA
    if (!munCode) throw new Error("Falta el código de municipio.");
    if (!idEnvio) throw new Error("Falta id_envio.");
    if (!fileName) throw new Error("Falta el nombre del archivo.");
    if (!base64Data) throw new Error("Falta el contenido del archivo (bytesBase64).");

    // Gancho de prueba (solo si el nombre empieza por FORZAR_ERROR)
    if (fileName.indexOf("FORZAR_ERROR") === 0) {
      throw new Error("Error de prueba forzado (FORZAR_ERROR).");
    }

    // Estimación de tamaño desde Base64 (aprox. 3/4 de la longitud)
    const approxBytes = Math.floor((String(base64Data).length * 3) / 4);
    if (approxBytes > LIMITE_BYTES) {
      throw new Error(
        'El archivo "' + fileName + '" supera el límite de 35 MB (' +
          Math.round(approxBytes / (1024 * 1024)) + " MB)."
      );
    }

    // 4. CARPETAS
    const carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
    const carpetaMun = getOrCreateFolder(carpetaRaiz, munCode);
    const carpetaExpediente = getOrCreateFolder(carpetaMun, idEnvio);

    let carpetaDestino;
    if (idEnvio.indexOf("-E-") !== -1 || idEnvio.indexOf("_E_") !== -1 || idEnvio.indexOf("EXP_E") === 0) {
      carpetaDestino = carpetaExpediente;
    } else {
      carpetaDestino = getOrCreateFolder(carpetaExpediente, seccion);
    }

    // 5. CREAR ARCHIVO
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const realBytes = blob.getBytes().length;
    if (realBytes > LIMITE_BYTES) {
      throw new Error(
        'El archivo "' + fileName + '" supera el límite de 35 MB tras decodificar.'
      );
    }

    const file = carpetaDestino.createFile(blob);

    // El enlace público no es necesario para el flujo EIEL (el PDF usa Drive
    // como propietario). En muchos Workspace, ANYONE_WITH_LINK lanza
    // "Acceso denegado: DriveApp" y tumba toda la subida aunque el archivo
    // ya se haya creado.
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
      "[ADJUNTOS OK] mun=" + munCode +
        " id_envio=" + idEnvio +
        " seccion=" + seccion +
        " tipo=" + tipo +
        " file=" + fileName +
        " bytes=" + realBytes +
        " user=" + usuario
    );
  } catch (error) {
    result.status = "error";
    result.message = error.toString();
    Logger.log("ERROR SUBIDA: " + error.toString());
    try {
      if (e && e.postData && e.postData.contents) {
        Logger.log("ERROR SUBIDA payload keys / hint: " + String(e.postData.contents).substring(0, 200));
      }
    } catch (ignore) {}
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
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
 * Prueba real de Drive: lectura de carpeta + creación + intento de compartir.
 * Ejecutar desde el editor (no desde la web).
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

  // Limpieza del fichero de prueba
  try {
    file.setTrashed(true);
  } catch (ignore) {}

  Logger.log("testDrivePermisos terminado");
}
