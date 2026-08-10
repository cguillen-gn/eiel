// --------------------------------------------------------------------
// SCRIPT DE ADJUNTOS (DRIVE) — fallback, action=check, import_url legado
// Pegar en URL_ADJUNTOS + log-errores.gs (+ auth-token.gs opcional) en el
// MISMO proyecto. Tras pegar: Implementar → Nueva versión.
//
// Camino principal del portal: Cloudflare Worker → Drive directo
// (workers/adjuntos/). Este script queda como:
//   - fallback base64 si el Worker falla
//   - action=check / client_log
//   - action=import_url (LEGADO; era el puente R2, el portal ya no lo usa)
// Tokens de sesión: desactivados a propósito; solo se validan si llegan.
// --------------------------------------------------------------------

const CARPETA_RAIZ_ID = "1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV";
const LIMITE_BYTES = 35 * 1024 * 1024;

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet(e) {
  // Health / action=check por query (curl y diagnóstico). Subidas van por doPost.
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || "").toLowerCase();
    if (action === "ping" || action === "version") {
      return jsonOut_({
        status: "success",
        message: "adjuntos ok",
        supports_check: true,
        version: "adjuntos-20260810a"
      });
    }
    if (action === "check") {
      var munFull = (p.municipio || p.mun || "").toString().trim();
      var mun = munFull ? munFull.slice(-3) : "";
      var idEnvio = (p.id_envio || "").toString().trim();
      var seccion = p.seccion || "DOCUMENTACION";
      var fileName = (p.filename || p.nombre_archivo || p.nombre || "")
        .toString()
        .trim();
      if (!mun || !idEnvio || !fileName) {
        return jsonOut_({
          status: "error",
          message: "Para action=check hacen falta municipio, id_envio y filename."
        });
      }
      return jsonOut_(checkAdjuntoExists_(mun, idEnvio, seccion, fileName));
    }
    // A veces el navegador/Apps Script reescribe un POST como GET vacío al
    // seguir un 302. No es un error de negocio: el cliente debe reintentar.
    return jsonOut_({
      status: "error",
      message:
        "Respuesta no válida del servidor (GET inesperado). Reintente la subida.",
      retryable: true,
      opaque: true
    });
  } catch (fatal) {
    Logger.log("FATAL ADJUNTOS doGet: " + fatal.toString());
    return jsonOut_({
      status: "error",
      message: friendlyUserMessageAdjuntos_(fatal)
    });
  }
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
    archivo: "",
    is_test: false
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
    const isTest =
      data.is_test === true ||
      data.is_test === "true" ||
      String(data.municipio_nombre || "").indexOf("PRUEBAS") !== -1;

    ctx.codigo = munCode;
    ctx.tipo = tipo;
    ctx.id_envio = idEnvio;
    ctx.usuario = usuario;
    ctx.archivo = fileName;
    ctx.is_test = isTest;

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

    // Tokens desactivados a propósito: solo valida si el cliente envía token.
    if (sessionToken && typeof assertValidSessionToken_ === "function") {
      assertValidSessionToken_(sessionToken, munCode);
    }

    if (!idEnvio) throw new Error("Falta id_envio.");

    // Comprobación ligera (sin base64): ¿el fichero ya está tras un 404 opaco?
    if (String(data.action || "").toLowerCase() === "check") {
      if (!fileName) throw new Error("Falta el nombre del archivo.");
      return jsonOut_(checkAdjuntoExists_(munCode, idEnvio, seccion, fileName));
    }

    // El cliente reporta un fallo definitivo (p. ej. tras GET opaco + check fallido).
    // doGet «GET inesperado» no escribe logs_errores a propósito (es reintentable).
    if (String(data.action || "").toLowerCase() === "client_log") {
      var clientMsg = friendlyUserMessageAdjuntos_(
        data.mensaje_usuario || data.message || "Error de subida (cliente)"
      );
      var wroteClient = false;
      if (typeof logErrorToSheet_ === "function") {
        wroteClient = logErrorToSheet_({
          origen: "adjuntos",
          codigo: munCode,
          tipo: tipo,
          id_envio: idEnvio,
          usuario: usuario,
          archivo: fileName || "(sin nombre)",
          mensaje_usuario: clientMsg,
          detalle: String(data.detalle || data.detail || "").substring(0, 1500),
          is_test: isTest
        });
      }
      return jsonOut_({
        status: wroteClient ? "success" : "error",
        message: wroteClient
          ? "Error registrado en logs_errores."
          : "No se pudo escribir en logs_errores."
      });
    }

    if (!fileName) throw new Error("Falta el nombre del archivo.");

    // LEGADO: importar desde URL (puente R2 antiguo). El portal actual no lo llama.
    if (String(data.action || "").toLowerCase() === "import_url") {
      var downloadUrl = String(data.download_url || data.get_url || data.url || "").trim();
      if (!downloadUrl) throw new Error("Falta download_url para import_url.");
      return jsonOut_(
        importAdjuntoFromUrl_(
          result,
          {
            munCode: munCode,
            idEnvio: idEnvio,
            seccion: seccion,
            fileName: fileName,
            mimeType: mimeType,
            usuario: usuario,
            tipo: tipo,
            isTest: isTest,
            downloadUrl: downloadUrl
          }
        )
      );
    }

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

    // Candado por fichero (no global): permite subidas paralelas de archivos distintos.
    const cacheKey = adjuntosIdempotencyKey_(idEnvio, seccion, fileName);
    return withAdjuntoFileLock_(cacheKey, function () {
      const cache = CacheService.getScriptCache();
      const cachedId = cache.get(cacheKey);
      if (cachedId) {
        try {
          var cachedFile = DriveApp.getFileById(cachedId);
          return jsonOut_(
            successIdempotent_(result, cachedFile, fileName, "cache")
          );
        } catch (cacheMiss) {
          cache.remove(cacheKey);
        }
      }

      const carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
      const carpetaMun = getOrCreateFolder(carpetaRaiz, munCode);
      const carpetaExpediente = getOrCreateFolder(carpetaMun, idEnvio);

      // Equipamientos (id con -E- / _E_ / EXP_E): ficheros directos en id_envio,
      // sin subcarpeta de sección. El resto: mun / id_envio / sección.
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

      // Drive a veces tarda en indexar getFilesByName; la caché cubre el hueco.
      var existentes = carpetaDestino.getFilesByName(fileName);
      if (existentes.hasNext()) {
        var ya = existentes.next();
        cache.put(cacheKey, ya.getId(), 600);
        return jsonOut_(successIdempotent_(result, ya, fileName, "drive"));
      }

      const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        mimeType,
        fileName
      );
      const realBytes = blob.getBytes().length;
      if (realBytes > LIMITE_BYTES) {
        throw new Error(
          'El archivo "' +
            fileName +
            '" supera el límite de 35 MB tras decodificar.'
        );
      }

      // Segunda comprobación por si otro intento ganó la carrera durante el decode.
      existentes = carpetaDestino.getFilesByName(fileName);
      if (existentes.hasNext()) {
        ya = existentes.next();
        cache.put(cacheKey, ya.getId(), 600);
        return jsonOut_(
          successIdempotent_(result, ya, fileName, "drive-post-decode")
        );
      }

      const file = carpetaDestino.createFile(blob);
      cache.put(cacheKey, file.getId(), 600);

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
      return jsonOut_(result);
    });
  } catch (error) {
    result.status = "error";
    result.message = friendlyUserMessageAdjuntos_(error);
    result.retryable = true;
    // Detalle técnico para consola / recuperación; el técnico ve message genérico.
    result.detalle = cleanErrorTextAdjuntos_(error);
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
        detalle: error.toString() + (error.stack ? "\n" + error.stack : ""),
        is_test: !!ctx.is_test
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

/**
 * LEGADO — Descarga desde una URL y guarda en Drive (misma jerarquía).
 * Quedó del puente Worker R2 + import_url; el portal ya sube con Worker→Drive.
 * Se mantiene por compatibilidad si alguien llama action=import_url a mano.
 */
function importAdjuntoFromUrl_(result, opts) {
  opts = opts || {};
  var munCode = opts.munCode;
  var idEnvio = opts.idEnvio;
  var seccion = opts.seccion || "DOCUMENTACION";
  var fileName = opts.fileName;
  var mimeType = opts.mimeType || "application/octet-stream";
  var downloadUrl = opts.downloadUrl;

  var cacheKey = adjuntosIdempotencyKey_(idEnvio, seccion, fileName);
  return withAdjuntoFileLock_(cacheKey, function () {
    var cache = CacheService.getScriptCache();
    var cachedId = cache.get(cacheKey);
    if (cachedId) {
      try {
        var cachedFile = DriveApp.getFileById(cachedId);
        return successIdempotent_(result, cachedFile, fileName, "cache");
      } catch (cacheMiss) {
        cache.remove(cacheKey);
      }
    }

    var carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
    var carpetaMun = getOrCreateFolder(carpetaRaiz, munCode);
    var carpetaExpediente = getOrCreateFolder(carpetaMun, idEnvio);
    // Misma regla que la subida base64: equipamientos sin subcarpeta sección.
    var carpetaDestino;
    if (
      idEnvio.indexOf("-E-") !== -1 ||
      idEnvio.indexOf("_E_") !== -1 ||
      idEnvio.indexOf("EXP_E") === 0
    ) {
      carpetaDestino = carpetaExpediente;
    } else {
      carpetaDestino = getOrCreateFolder(carpetaExpediente, seccion);
    }

    var existentes = carpetaDestino.getFilesByName(fileName);
    if (existentes.hasNext()) {
      var ya = existentes.next();
      cache.put(cacheKey, ya.getId(), 600);
      return successIdempotent_(result, ya, fileName, "drive");
    }

    // UrlFetch con reintentos: descargas grandes en paralelo suelen fallar
    // (timeout / throttling). Solo aplica a este camino legado import_url.
    var bytes = null;
    var lastFetchErr = null;
    var fetchAttempts = 3;
    for (var fi = 0; fi < fetchAttempts; fi++) {
      if (fi > 0) {
        Utilities.sleep(1500 * fi);
        Logger.log(
          "[ADJUNTOS import_url] reintento UrlFetch " +
            (fi + 1) +
            "/" +
            fetchAttempts +
            " file=" +
            fileName
        );
      }
      try {
        var resp = UrlFetchApp.fetch(downloadUrl, {
          method: "get",
          muteHttpExceptions: true,
          followRedirects: true
        });
        var code = resp.getResponseCode();
        if (code < 200 || code >= 300) {
          lastFetchErr = new Error(
            "No se pudo descargar el adjunto desde el Worker (HTTP " +
              code +
              ")."
          );
          continue;
        }
        bytes = resp.getBlob().getBytes();
        if (!bytes || !bytes.length) {
          lastFetchErr = new Error("El Worker devolvió un archivo vacío.");
          bytes = null;
          continue;
        }
        lastFetchErr = null;
        break;
      } catch (fetchEx) {
        lastFetchErr = fetchEx;
        bytes = null;
      }
    }
    if (!bytes || !bytes.length) {
      throw lastFetchErr ||
        new Error("No se pudo descargar el adjunto desde el Worker.");
    }
    if (bytes.length > LIMITE_BYTES) {
      throw new Error(
        'El archivo "' + fileName + '" supera el límite de 35 MB tras descargar.'
      );
    }

    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = carpetaDestino.createFile(blob);
    cache.put(cacheKey, file.getId(), 600);

    var sharingOk = true;
    try {
      // Política Workspace: puede fallar; no bloquea.
      // file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      sharingOk = false;
    }

    result.status = "success";
    result.fileId = file.getId();
    result.url = file.getUrl();
    result.message = sharingOk
      ? "Archivo importado a Drive desde URL (legado)."
      : "Archivo importado a Drive desde URL (legado, sin enlace público).";
    result.filename = fileName;
    result.bytes = bytes.length;
    // via histórico; no indica que el portal use R2 hoy.
    result.via = "r2_import";
    Logger.log(
      "[ADJUNTOS import_url OK] mun=" +
        munCode +
        " file=" +
        fileName +
        " bytes=" +
        bytes.length
    );
    return result;
  });
}

/**
 * Candado blando por clave de fichero (CacheService).
 * Serializa reintentos del mismo archivo; permite paralelo entre archivos distintos.
 */
function withAdjuntoFileLock_(cacheKey, fn) {
  var cache = CacheService.getScriptCache();
  var lockKey = ("lk:" + String(cacheKey || "")).substring(0, 250);
  var token = Utilities.getUuid();
  var deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    var holder = cache.get(lockKey);
    if (!holder) {
      cache.put(lockKey, token, 60);
      Utilities.sleep(40);
      if (cache.get(lockKey) === token) {
        try {
          return fn();
        } finally {
          try {
            if (cache.get(lockKey) === token) cache.remove(lockKey);
          } catch (ignoreUnlock) {}
        }
      }
    }
    Utilities.sleep(120 + Math.floor(Math.random() * 180));
  }
  throw new Error(
    "El servidor está ocupado subiendo el mismo archivo. Espere unos segundos e inténtelo de nuevo."
  );
}

/** Clave de idempotencia por envío + sección + nombre. */
function adjuntosIdempotencyKey_(idEnvio, seccion, fileName) {
  return (
    "up:" +
    String(idEnvio || "") +
    "|" +
    String(seccion || "") +
    "|" +
    String(fileName || "")
  ).substring(0, 240);
}

/**
 * ¿Existe ya el fichero en caché o en Drive para este envío/sección?
 * Usado por action=check (reintento tras HTML 404 sin reenviar el base64).
 */
function checkAdjuntoExists_(munCode, idEnvio, seccion, fileName) {
  var out = {
    status: "missing",
    success: false,
    message: "No encontrado",
    filename: fileName
  };
  try {
    var cacheKey = adjuntosIdempotencyKey_(idEnvio, seccion, fileName);
    var cache = CacheService.getScriptCache();
    var cachedId = cache.get(cacheKey);
    if (cachedId) {
      try {
        var cachedFile = DriveApp.getFileById(cachedId);
        return successIdempotent_(out, cachedFile, fileName, "check-cache");
      } catch (e) {
        cache.remove(cacheKey);
      }
    }

    var carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
    var carpetaMun = getOrCreateFolder(carpetaRaiz, munCode);
    // Puede haber varias carpetas con el mismo id_envio (carrera en paralelo).
    var itExp = carpetaMun.getFoldersByName(idEnvio);
    var isEquip =
      idEnvio.indexOf("-E-") !== -1 ||
      idEnvio.indexOf("_E_") !== -1 ||
      idEnvio.indexOf("EXP_E") === 0;
    while (itExp.hasNext()) {
      var carpetaExpediente = itExp.next();
      var destinos = [];
      if (isEquip) {
        destinos.push(carpetaExpediente);
      } else {
        var itSec = carpetaExpediente.getFoldersByName(seccion);
        while (itSec.hasNext()) destinos.push(itSec.next());
      }
      for (var di = 0; di < destinos.length; di++) {
        var existentes = destinos[di].getFilesByName(fileName);
        if (existentes.hasNext()) {
          var ya = existentes.next();
          cache.put(cacheKey, ya.getId(), 600);
          return successIdempotent_(out, ya, fileName, "check-drive");
        }
      }
    }
  } catch (err) {
    Logger.log("[ADJUNTOS CHECK] " + err.toString());
    out.message = cleanErrorTextAdjuntos_(err);
  }
  return out;
}

/** Respuesta success cuando el fichero ya existía (reintento). */
function successIdempotent_(result, file, fileName, via) {
  result.status = "success";
  result.fileId = file.getId();
  result.url = file.getUrl();
  result.message = "Archivo ya estaba subido (reintento idempotente).";
  result.filename = fileName;
  try {
    result.bytes = file.getSize();
  } catch (e) {
    result.bytes = 0;
  }
  result.sharing = false;
  result.idempotent = true;
  result.idempotent_via = via || "";
  Logger.log(
    "[ADJUNTOS IDEMPOTENTE via=" +
      (via || "") +
      "] file=" +
      fileName +
      " id=" +
      result.fileId
  );
  return result;
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
 * Mensaje para el técnico: genérico (detalle técnico → logs_errores / Logger).
 * Excepción: sesión caducada (el técnico puede actuar).
 */
function friendlyUserMessageAdjuntos_(err) {
  var raw = cleanErrorTextAdjuntos_(err);
  var lower = raw.toLowerCase();

  if (lower.indexOf("sesión") !== -1) {
    return withAyudaAdjuntos_(
      "Su sesión no es válida o ha caducado. Cierre sesión, vuelva a entrar e inténtelo de nuevo."
    );
  }
  return withAyudaAdjuntos_(
    "Ha ocurrido un problema al completar el envío. Espere unos segundos e inténtelo de nuevo. Si el problema continúa, escriba a eiel@geonet.es indicando municipio y formulario."
  );
}

function getOrCreateFolder(parent, name) {
  // Camino rápido: si hay varias (carrera), usa la más antigua.
  var it = parent.getFoldersByName(name);
  var existentes = [];
  while (it.hasNext()) existentes.push(it.next());
  if (existentes.length === 1) return existentes[0];
  if (existentes.length > 1) {
    existentes.sort(function (a, b) {
      return a.getDateCreated() - b.getDateCreated();
    });
    return existentes[0];
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    it = parent.getFoldersByName(name);
    existentes = [];
    while (it.hasNext()) existentes.push(it.next());
    if (existentes.length) {
      existentes.sort(function (a, b) {
        return a.getDateCreated() - b.getDateCreated();
      });
      return existentes[0];
    }
    return parent.createFolder(name);
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
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
