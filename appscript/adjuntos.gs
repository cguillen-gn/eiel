// --------------------------------------------------------------------
// SCRIPT DE ADJUNTOS (DRIVE) — validación, token de sesión, JSON legible
// Pegar en URL_ADJUNTOS + auth-token.gs + log-errores.gs en el MISMO proyecto.
// Tras pegar: Implementar → Nueva versión.
//
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
    var fatalMsg = friendlyUserMessageAdjuntos_(fatal);
    if (typeof logErrorToSheet_ === "function") {
      logErrorToSheet_({
        origen: "adjuntos",
        mensaje_usuario: fatalMsg,
        detalle: fatal.toString() + (fatal.stack ? "\n" + fatal.stack : "")
      });
    } else {
      Logger.log(
        "AVISO: falta log-errores.gs en el proyecto Adjuntos (logErrorToSheet_ no definida)."
      );
    }
    return jsonOut_({
      status: "error",
      message: fatalMsg
    });
  }
}

function handleAdjuntosPost_(e) {
  const result = { status: "error", message: "" };
  // Contexto para logs_errores (visible en el catch)
  var ctx = {
    codigo: "",
    tipo: "",
    id_envio: "",
    usuario: "",
    archivo: ""
  };

  try {
    if (!e) throw new Error("No hay datos de entrada.");

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

    ctx.codigo = munCode;
    ctx.tipo = tipo;
    ctx.id_envio = idEnvio;
    ctx.usuario = usuario;
    ctx.archivo = fileName;

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

    // Tokens desactivados temporalmente: solo valida si llega token.
    if (sessionToken && typeof assertValidSessionToken_ === "function") {
      assertValidSessionToken_(sessionToken, munCode);
    }

    if (!idEnvio) throw new Error("Falta id_envio.");
    if (!fileName) throw new Error("Falta el nombre del archivo.");
    if (!base64Data) throw new Error("Falta el contenido del archivo (bytesBase64).");

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

    // Idempotencia: si el mismo nombre ya está en la carpeta (reintento tras
    // HTML 404 de Apps Script que a veces llega DESPUÉS de guardar), no duplicar.
    var existentes = carpetaDestino.getFilesByName(fileName);
    if (existentes.hasNext()) {
      var ya = existentes.next();
      result.status = "success";
      result.fileId = ya.getId();
      result.url = ya.getUrl();
      result.message = "Archivo ya estaba subido (reintento idempotente).";
      result.filename = fileName;
      result.bytes = ya.getSize();
      result.sharing = false;
      result.idempotent = true;
      Logger.log(
        "[ADJUNTOS IDEMPOTENTE] mun=" +
          munCode +
          " id_envio=" +
          idEnvio +
          " seccion=" +
          seccion +
          " file=" +
          fileName
      );
      return jsonOut_(result);
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
    result.message = friendlyUserMessageAdjuntos_(error);
    Logger.log("ERROR SUBIDA: " + error.toString());
    try {
      Logger.log("ERROR stack: " + (error.stack || "(sin stack)"));
    } catch (ignore) {}
    if (typeof logErrorToSheet_ === "function") {
      var wrote = logErrorToSheet_({
        origen: "adjuntos",
        codigo: ctx.codigo,
        tipo: ctx.tipo,
        id_envio: ctx.id_envio,
        usuario: ctx.usuario,
        archivo: ctx.archivo,
        mensaje_usuario: result.message,
        detalle: error.toString() + (error.stack ? "\n" + error.stack : "")
      });
      if (!wrote) {
        Logger.log(
          "AVISO: logErrorToSheet_ no escribió fila (permisos hoja / pestaña logs_errores)."
        );
      }
    } else {
      Logger.log(
        "AVISO: falta log-errores.gs en el proyecto Adjuntos (logErrorToSheet_ no definida)."
      );
    }
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

var EIEL_CONTACTO_AYUDA = "eiel@geonet.es";

function withAyudaAdjuntos_(msg) {
  var s = String(msg || "").trim();
  if (!s) s = "Ha ocurrido un problema al subir el archivo.";
  if (s.toLowerCase().indexOf(EIEL_CONTACTO_AYUDA.toLowerCase()) !== -1) return s;
  return s + " Si necesita ayuda, escriba a " + EIEL_CONTACTO_AYUDA + ".";
}

function cleanErrorTextAdjuntos_(err) {
  var s = "";
  if (err && err.message) s = String(err.message);
  else if (err != null) s = String(err);
  s = s.trim();
  while (/^Error:\s*/i.test(s)) {
    s = s.replace(/^Error:\s*/i, "").trim();
  }
  return s || "Error desconocido";
}

/**
 * Mensaje para el técnico: qué ha pasado + qué hacer + contacto.
 * Sin detalles internos del sistema de almacenamiento.
 */
function friendlyUserMessageAdjuntos_(err) {
  var raw = cleanErrorTextAdjuntos_(err);
  var lower = raw.toLowerCase();

  if (lower.indexOf("sesión") !== -1) {
    return withAyudaAdjuntos_(
      "Su sesión no es válida o ha caducado. Cierre sesión, vuelva a entrar e inténtelo de nuevo."
    );
  }
  if (lower.indexOf("supera el límite") !== -1 || lower.indexOf("35 mb") !== -1) {
    return withAyudaAdjuntos_(
      "El archivo supera el tamaño máximo permitido (35 MB). Reduzca el tamaño o divídalo e inténtelo de nuevo."
    );
  }
  if (
    lower.indexOf("falta ") === 0 ||
    lower.indexOf("no hay datos") !== -1 ||
    lower.indexOf("auth-token") !== -1
  ) {
    return withAyudaAdjuntos_(
      "Faltan datos necesarios para la subida. Recargue la página, vuelva a iniciar sesión e inténtelo de nuevo."
    );
  }
  if (lower.indexOf("access denied") !== -1 || lower.indexOf("acceso denegado") !== -1) {
    return withAyudaAdjuntos_(
      "No se ha podido guardar el archivo por un problema del sistema. Inténtelo de nuevo más tarde."
    );
  }
  if (
    lower.indexOf("quota") !== -1 ||
    (lower.indexOf("limit") !== -1 && lower.indexOf("archivo") === -1)
  ) {
    return withAyudaAdjuntos_(
      "El sistema está saturado temporalmente. Espere unos minutos e inténtelo de nuevo."
    );
  }
  return withAyudaAdjuntos_(
    "No se ha podido subir el archivo. Inténtelo de nuevo en unos minutos."
  );
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
