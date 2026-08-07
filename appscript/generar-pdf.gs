// ====================================================================
// SCRIPT GENERAR PDF (VÍA HTML), ENVIO EMAIL Y LOGS
// ====================================================================
// Pegar en el proyecto Apps Script de URL_GENERAR_PDF y redesplegar
// una NUEVA VERSIÓN (Implementar → Nueva versión → /exec).
//
// Requiere en el MISMO proyecto:
//   - auth-token.gs (HMAC)
//   - log-errores.gs (hoja logs_errores)
//
// Contrato de respuesta JSON (front sendPdfPayload):
//   { status: "success"|"error", success: boolean, message: string, ... }
// ====================================================================



// --- CONFIGURACIÓN GENERAL ---
const CARPETA_PDF_ID = "1QVELCBWRTdLDfr-RTGrnJUXzpA85A4JO"; 
const CARPETA_RAIZ_ADJUNTOS_ID = "1XhyB9YD_m1jk_DTVzH782GWIiW62FPkV";
const EMAIL_FIJO_DESTINO = "eiel@geonet.es";

// --- CONFIGURACIÓN DE LOGS ---
const ID_HOJA_LOGS = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM"; 
const NOMBRE_PESTANA_LOGS = "logs_envios";
const NOMBRE_PESTANA_LOGS_PRUEBAS = "logs_envios_pruebas";
/** Marcador de despliegue: debe verse en la respuesta JSON del PDF (eiel_build). */
const EIEL_BUILD_PDF = "logs-split-20260806";

/** Pestaña de envíos: producción vs pruebas. */
function pestanaEnvios_(esPrueba) {
  return esPrueba ? NOMBRE_PESTANA_LOGS_PRUEBAS : NOMBRE_PESTANA_LOGS;
}

/** Detecta modo prueba (flag del portal o municipio con «PRUEBAS»). */
function esEnvioPrueba_(info) {
  info = info || {};
  var flag = info.is_test;
  if (flag === true || flag === "true" || flag === 1 || flag === "1") return true;
  var muni = String(info.muni || info.municipio || "");
  return muni.indexOf("PRUEBAS") !== -1;
}

/**
 * Punto de entrada para las peticiones POST desde el cliente.
 */
function doPost(e) {
  // Evita solaparse con otro envío PDF en el mismo proyecto (máx. 30 s).
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); 
  } catch (f) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      success: false, 
      message:
        "Ha ocurrido un problema al completar el envío. Espere unos segundos e inténtelo de nuevo. Si el problema continúa, escriba a eiel@geonet.es indicando municipio y formulario."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const result = { status: "error", success: false, message: "Error desconocido." };
  let registro = null;
  var ctx = {
    municipio: "",
    codigo: "",
    tipo: "",
    id_envio: "",
    id_registro: "",
    usuario: "",
    is_test: false
  };

  try {
    if (!e) throw new Error("No se recibieron datos.");

    // 2. RECEPCIÓN Y NORMALIZACIÓN DE DATOS
    var data = {};
    if (e.postData && e.postData.contents && isJson(e.postData.contents)) {
       data = JSON.parse(e.postData.contents);
    } else {
       data = e.parameter;
    }

    // Sesión firmada opcional (tokens desactivados a propósito en el portal).
    const municipioCodigoEarly =
      data.municipio_codigo || data.muni_code || "000";
    var sessionTokenPdf = data.session_token || data.token || "";
    if (sessionTokenPdf && typeof assertValidSessionToken_ === "function") {
      assertValidSessionToken_(sessionTokenPdf, municipioCodigoEarly);
    }

    const TIPO_FORMULARIO = (data.tipo_formulario || data.tipo_ficha || "agua").toLowerCase();

    const isTestMode =
      data.is_test === true ||
      data.is_test === "true" ||
      data.is_test === 1 ||
      data.is_test === "1" ||
      String(data.municipio_nombre || data.muni_display || "").indexOf("PRUEBAS") !== -1;

    ctx.codigo = String(municipioCodigoEarly).slice(-3);
    ctx.tipo = TIPO_FORMULARIO;
    ctx.id_envio = (data.id_envio || "").toString();
    ctx.municipio = (data.municipio_nombre || data.muni_display || "").toString();
    ctx.usuario = (data.email_contacto || "").toString();
    ctx.is_test = isTestMode;
    
    const input = {
      is_test: isTestMode,
      fase: data.fase || "----",
      municipio_nombre: data.municipio_nombre || data.muni_display || "Desconocido",
      municipio_codigo: municipioCodigoEarly,
      
      // Bloque Gestión
      gestion_tipo: data.gestion_tipo || "No indicado",
      gestion_empresa: data.gestion_empresa || "No indicado",
      gestion_otro: data.gestion_otro || "No indicado",
      gestion_tecnico_nombre: data.gestion_tecnico_nombre || "No indicado",
      gestion_tecnico_tel: data.gestion_tecnico_tel || "No indicado",
      gestion_tecnico_email: data.gestion_tecnico_email || "No indicado",

      // Datos de Contacto
      nombre_contacto: data.nombre_contacto || "No indicado",
      departamento_contacto: data.departamento_contacto || "No indicado",
      email_contacto: data.email_contacto || "anonimo",
      
      // lista_archivos puede llegar como array JSON; no usarlo como string crudo.
      archivos_adjuntos: Array.isArray(data.lista_archivos)
        ? data.lista_archivos.join("\n")
        : data.lista_archivos || data.archivos_adjuntos || "",
      
      // Datos Específicos
      consumo: data.consumo,
      depositos: data.depositos,
      obras: data.obras || data.datos_obras_json,
      otras_obras: data.otras_obras_json,
      residuos: data.residuos_data,
      personas_limpieza: data.personas_limpieza,
      cementerios: data.cementerios || data.cementerios_data,
      equipamientos: data.equipamientos || data.datos_equipamientos_json,
      sin_uso: data.edificios_sin_uso_json,
      nuevos_equipamientos: data.nuevos_equipamientos_json,
      respuestas_requerimientos: data.respuestas_requerimientos_json,
      observaciones: data.observaciones || "Sin observaciones."
    };

    // 3. PREPARACIÓN DE DATOS PARA EL HTML
    let templateData = {
      IS_TEST: isTestMode,

      FASE: input.fase,
      MUNI_NOMBRE: input.municipio_nombre,
      MUNI_CODIGO: input.municipio_codigo,
      EMAIL_CONTACTO: input.email_contacto,
      NOMBRE_CONTACTO: input.nombre_contacto,
      DEPARTAMENTO_CONTACTO: input.departamento_contacto,
      TIPO_FORMULARIO: TIPO_FORMULARIO,
      // Nunca partir por comas: los nombres de fichero suelen llevarlas.
      NOMBRES_ADJUNTOS: parseNombresAdjuntos_(data),
      FECHA_ENVIO: new Date().toLocaleDateString('es-ES') + " " + new Date().toLocaleTimeString('es-ES'),
      OBSERVACIONES: input.observaciones,
      
      GESTION_TIPO: input.gestion_tipo,
      GESTION_EMPRESA: input.gestion_empresa,
      GESTION_OTRO: input.gestion_otro,
      GESTION_TEC_NOMBRE: input.gestion_tecnico_nombre,
      GESTION_TEC_TEL: input.gestion_tecnico_tel,
      GESTION_TEC_EMAIL: input.gestion_tecnico_email,

      CONSUMO_ANUAL: input.consumo || "-",
      DEPOSITOS: safeParse(input.depositos),
      DATOS_OBRAS: safeParse(input.obras),
      DATOS_OTRAS_OBRAS: safeParse(input.otras_obras),
      RESIDUOS_DATA: safeParse(input.residuos),
      PERSONAS_LIMPIEZA: input.personas_limpieza || "-",
      CEMENTERIOS_DATA: safeParse(input.cementerios),
      DATOS_EQUIPAMIENTOS: safeParse(input.equipamientos),
      DATOS_SIN_USO: safeParse(input.sin_uso),
      DATOS_NUEVOS_EQUIPAMIENTOS: safeParse(input.nuevos_equipamientos),
      DATOS_REQUERIMIENTOS: safeParse(input.respuestas_requerimientos)
    };

    let subjectForm = "";
    switch (TIPO_FORMULARIO) {
      case "agua": subjectForm = "Abastecimiento de Agua"; break;
      case "obras": subjectForm = "Obras"; break;
      case "residuos": subjectForm = "Gestión de Residuos"; break;
      case "cementerios": subjectForm = "Cementerios"; break;
      case "equipamientos": subjectForm = "Equipamientos"; break;
      case "alumbrado": subjectForm = "Alumbrado Público"; break;
      case "viario": subjectForm = "Viario"; break;
      case "saneamiento": subjectForm = "Saneamiento"; break;
      default: subjectForm = "Formulario (" + TIPO_FORMULARIO + ")";
    }

    // 4. REGISTRO INICIAL (Generación de ID Único)
    registro = logToSheet({
        fecha: templateData.FECHA_ENVIO,
        muni: templateData.MUNI_NOMBRE,
        codigo: templateData.MUNI_CODIGO,
        fase: templateData.FASE,
        tipo: TIPO_FORMULARIO,
        usuario: templateData.EMAIL_CONTACTO,
        contacto: templateData.NOMBRE_CONTACTO,
        departamento: templateData.DEPARTAMENTO_CONTACTO,
        pdfUrl: "Generando...", 
        adjuntos: templateData.NOMBRES_ADJUNTOS.length > 0 ? templateData.NOMBRES_ADJUNTOS.join(", ") : "Ninguno",
        is_test: isTestMode,
        envio_started_at: data.envio_started_at || data.timestamp_envio || ""
    });
    registro.envio_started_at = data.envio_started_at || data.timestamp_envio || "";

    // 5. Organización de carpetas en Drive (adjuntos del id_envio).
    try {
      const muniCodeFolder = templateData.MUNI_CODIGO.toString().slice(-3); 
      const raizAdjuntos = DriveApp.getFolderById(CARPETA_RAIZ_ADJUNTOS_ID);
      
      const itMun = raizAdjuntos.getFoldersByName(muniCodeFolder);
      if (itMun.hasNext()) {
        const carpetaMun = itMun.next();
        // Buscamos la carpeta por el id_envio que nos manda la web
        const itTemp = carpetaMun.getFoldersByName(data.id_envio);
        
        if (itTemp.hasNext()) {
          const carpetaA_Renombrar = itTemp.next();
          
          // REINTENTO DE RENOMBRADO: Si falla, esperamos 1 segundo y probamos otra vez
          try {
            carpetaA_Renombrar.setName(registro.id);
          } catch (err) {
            Utilities.sleep(1500); // Pausa de seguridad
            carpetaA_Renombrar.setName(registro.id);
          }
        }
      }
    } catch (e) {
      // Si falla el renombrado, lo anotamos, pero NO paramos el script.
      // Así el email llegará aunque la carpeta se quede con el nombre feo.
      console.warn("Aviso: Carpeta ocupada, se enviará el email sin renombrar: " + e.toString());
    }

    templateData.ID_REGISTRO = registro.id;
    ctx.id_registro = registro.id;
    ctx.municipio = templateData.MUNI_NOMBRE || ctx.municipio;

    // 5b. VERIFICAR QUE LOS ADJUNTOS DECLARADOS ESTÁN EN DRIVE
    // (evita éxito/email si la subida falló o la carpeta no existe)
    assertAdjuntosPresentes_(
      templateData.MUNI_CODIGO,
      data.id_envio,
      registro.id,
      templateData.NOMBRES_ADJUNTOS
    );

    // 6. GENERACIÓN Y ORGANIZACIÓN DEL ARCHIVO PDF POR MUNICIPIO
    const htmlContent = generarHTML(templateData, subjectForm);
    const pdfBlob = Utilities.newBlob(htmlContent, MimeType.HTML).getAs(MimeType.PDF);
    pdfBlob.setName(`EIEL_${templateData.MUNI_CODIGO}_${TIPO_FORMULARIO.toUpperCase()}_${registro.id}.pdf`);

    // --- LÓGICA DE ORGANIZACIÓN POR CARPETAS ---
    const raizPdf = DriveApp.getFolderById(CARPETA_PDF_ID);
    const muniCodeFolder = templateData.MUNI_CODIGO.toString().slice(-3); // Sacamos los 3 últimos dígitos
    
    let carpetaDestino;
    const carpetasExistentes = raizPdf.getFoldersByName(muniCodeFolder);
    
    if (carpetasExistentes.hasNext()) {
      // Si la carpeta del municipio ya existe, la seleccionamos
      carpetaDestino = carpetasExistentes.next();
    } else {
      // Si no existe, la creamos dentro de la carpeta raíz de PDFs
      carpetaDestino = raizPdf.createFolder(muniCodeFolder);
    }

    // Guardamos el PDF directamente en la carpeta del municipio
    const pdfFile = carpetaDestino.createFile(pdfBlob);
    
    // Sin setSharing público: el enlace del log basta para quien tenga acceso Drive.
    actualizarUrlLog(
      registro.fila,
      pdfFile.getUrl(),
      registro.envio_started_at,
      registro.pestana
    );

    // Adjuntos ya verificados en Drive (assertAdjuntosPresentes_).

    // 7. ENVÍO DE NOTIFICACIONES POR EMAIL
    const subject = `[Ref: ${templateData.ID_REGISTRO}] Justificante EIEL - ${templateData.MUNI_NOMBRE} - ${subjectForm}`;
    const htmlBody = `
        <p>Formulario de <b>${subjectForm}</b> recibido.</p>
        <p><b>ID de Registro:</b> ${templateData.ID_REGISTRO}<br>
        <b>Municipio:</b> ${templateData.MUNI_NOMBRE}</p>
        <p>Se adjunta justificante PDF.</p>
        <br>
      `;

    let destinatarioPrincipal = (templateData.EMAIL_CONTACTO && templateData.EMAIL_CONTACTO.includes("@")) 
                                ? templateData.EMAIL_CONTACTO 
                                : EMAIL_FIJO_DESTINO;

    const aliases = GmailApp.getAliases();
    let miAlias = aliases.find(a => a.toLowerCase() === "eiel@geonet.es") || (aliases.length > 0 ? aliases[0] : null);

    let opcionesEnvio = {
      from: miAlias,
      bcc: EMAIL_FIJO_DESTINO, 
      htmlBody: htmlBody,   
      attachments: [pdfBlob]
    };

    if (destinatarioPrincipal === EMAIL_FIJO_DESTINO) {
      delete opcionesEnvio.bcc;
    }

    GmailApp.sendEmail(destinatarioPrincipal, subject, "Se adjunta justificante EIEL en PDF.", opcionesEnvio);

    result.status = "success";
    result.success = true;
    result.message = "PDF generado y enviado.";
    result.downloadUrl = pdfFile.getUrl();
    result.id_registro = registro.id;
    result.is_test = !!ctx.is_test;
    result.log_pestana = (registro && registro.pestana) || pestanaEnvios_(!!ctx.is_test);
    result.eiel_build = EIEL_BUILD_PDF;
    console.log(
      "[EIEL PDF] build=" +
        EIEL_BUILD_PDF +
        " is_test=" +
        !!ctx.is_test +
        " log_pestana=" +
        result.log_pestana +
        " id=" +
        registro.id
    );

  } catch (error) {
      console.error("ERROR CRÍTICO: " + error.toString());
      result.status = "error";
      result.success = false;
      result.message = friendlyUserMessage_(error);

      // Forzamos el aviso incluso si 'registro' no se ha definido correctamente
      try {
        const pestanaLog =
          (registro && registro.pestana) || pestanaEnvios_(!!ctx.is_test);
        const filaAfectada =
          registro && registro.fila
            ? registro.fila
            : SpreadsheetApp.openById(ID_HOJA_LOGS).getSheetByName(pestanaLog).getLastRow();
        const startedAt = (registro && registro.envio_started_at) || "";
        actualizarUrlLog(
          filaAfectada,
          "ERROR: " + cleanErrorText_(error),
          startedAt,
          pestanaLog
        );
      } catch (e) {
          console.error("No se pudo actualizar el log de error: " + e.toString());
        }

      if (typeof logErrorToSheet_ === "function") {
        var wrote = logErrorToSheet_({
          origen: "pdf",
          municipio: ctx.municipio,
          codigo: ctx.codigo,
          tipo: ctx.tipo,
          id_envio: ctx.id_envio,
          id_registro: ctx.id_registro || (registro && registro.id) || "",
          usuario: ctx.usuario,
          mensaje_usuario: result.message,
          detalle: error.toString() + (error.stack ? "\n" + error.stack : ""),
          is_test: !!ctx.is_test
        });
        if (!wrote) {
          console.error(
            "AVISO: logErrorToSheet_ no escribió fila (permisos hoja / pestaña logs_errores)."
          );
        }
      } else {
        console.error(
          "AVISO: falta log-errores.gs en el proyecto PDF (logErrorToSheet_ no definida)."
        );
      }
    // -----------------------------------------------------------

  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Inserta una nueva fila en la hoja de Logs y genera el ID correlativo anual.
 * @param {Object} info Datos del envío.
 * @return {Object} ID único generado y fila de inserción.
 */
function logToSheet(info) {
  if (!ID_HOJA_LOGS || ID_HOJA_LOGS.includes("PEGAR_AQUI")) return {id: "N/A", fila: 0}; 

  const esPrueba = esEnvioPrueba_(info);
  const pestana = pestanaEnvios_(esPrueba);

  const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
  let sheet = ss.getSheetByName(pestana);

  // Si la pestaña no existe, la creamos con sus encabezados 
  if (!sheet) {
    sheet = ss.insertSheet(pestana); 
    const encabezados = [
      "ID",
      "Fecha Envío",
      "Municipio",
      "Código INE",
      "Fase",
      "Tipo Formulario",
      "Email Usuario",
      "Nombre Contacto",
      "Departamento",
      "Enlace PDF Justificante",
      "Archivos Adjuntos",
      "Duración (s)"
    ]; 
    sheet.appendRow(encabezados); 
    sheet.getRange(1, 1, 1, encabezados.length).setFontWeight("bold").setBackground("#f3f3f3"); 
    sheet.setFrozenRows(1); 
  } else {
    ensureDuracionHeader_(sheet);
  }

  const filaNueva = sheet.getLastRow() + 1; 
  const anioActual = new Date().getFullYear();

  // Correlativo anual solo dentro de esta pestaña (prod y pruebas independientes)
  let contadorAnual = 0; 
  if (sheet.getLastRow() > 1) {
    const registros = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues(); 
    
    contadorAnual = registros.filter(fila => {
      const idStr = fila[0] ? fila[0].toString() : "";
      return idStr.indexOf(String(anioActual) + "-") !== -1;
    }).length;
  }

  // --- MAPEO DE PREFIJOS ---
  const prefijos = {
    "agua": "AG",
    "alumbrado": "AL",
    "obras": "OB",
    "residuos": "RE",
    "cementerios": "CE",
    "equipamientos": "EQ",
    "viario": "VI",
    "saneamiento": "SA"
  }; 

  const prefijoForm = prefijos[info.tipo.toLowerCase()] || info.tipo.charAt(0).toUpperCase(); 
  
  // El nuevo número es el conteo actual del año + 1, con 5 cifras 
  const numeroCorrelativo = (contadorAnual + 1).toString().padStart(5, '0'); 
  
  // Generamos el ID base (Ejem: 2026-027-AG-00001)
  let idUnico = `${anioActual}-${info.codigo}-${prefijoForm}-${numeroCorrelativo}`; 

  // Prefijo TEST- en pruebas (también van a pestaña aparte)
  if (esPrueba) {
    idUnico = "TEST-" + idUnico;
  }

  // Insertamos las columnas (Duración se rellena al final en actualizarUrlLog)
  sheet.appendRow([
    idUnico,            // A: ID (con prefijo TEST si aplica)
    info.fecha,         // B: Fecha Envío
    info.muni,          // C: Municipio
    "'" + info.codigo,  // D: Código INE
    info.fase,          // E: Fase
    info.tipo,          // F: Tipo Formulario
    info.usuario,       // G: Email Usuario
    info.contacto,      // H: Nombre Contacto
    info.departamento,  // I: Departamento
    info.pdfUrl,        // J: Enlace PDF Justificante
    info.adjuntos,      // K: Archivos Adjuntos
    ""                  // L: Duración (s) — se completa al terminar
  ]); 

  return {
    id: idUnico,
    fila: filaNueva,
    envio_started_at: info.envio_started_at || "",
    is_test: esPrueba,
    pestana: pestana
  }; 
}

/**
 * Asegura la columna "Duración (s)" en el encabezado (hojas ya existentes).
 * @return {number} Índice 1-based de la columna.
 */
function ensureDuracionHeader_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 12)).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").toLowerCase().indexOf("duraci") !== -1) {
      return i + 1;
    }
  }
  var col = lastCol < 12 ? 12 : lastCol + 1;
  sheet
    .getRange(1, col)
    .setValue("Duración (s)")
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  return col;
}

/**
 * Actualiza el enlace PDF y, si hay marca de inicio, la duración del envío.
 * @param {number} fila
 * @param {string} url
 * @param {string} [envioStartedAt]
 * @param {string} [pestana] - logs_envios | logs_envios_pruebas
 */
function actualizarUrlLog(fila, url, envioStartedAt, pestana) {
  var nombrePestana = pestana || NOMBRE_PESTANA_LOGS;
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
    const sheet = ss.getSheetByName(nombrePestana);
    
    if (sheet && fila > 0) {
      sheet.getRange(fila, 10).setValue(url);
      escribirDuracionLog_(sheet, fila, envioStartedAt);
    }
  } catch (e) {
    console.error("Error actualizando URL en el log: " + e.toString());
    
    try {
      const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
      const sheet = ss.getSheetByName(nombrePestana);
      sheet.getRange(fila, 10).setValue("ERROR EN actualizarUrlLog: " + e.toString());
      escribirDuracionLog_(sheet, fila, envioStartedAt);
    } catch (errorInterno) {
      // Si falla esto, es que la hoja de cálculo es inaccesible
    }
  }
}

/** Escribe duración en segundos desde envio_started_at (ISO) hasta ahora. */
function escribirDuracionLog_(sheet, fila, envioStartedAt) {
  if (!sheet || !fila || !envioStartedAt) return;
  try {
    var start = new Date(String(envioStartedAt)).getTime();
    if (isNaN(start)) return;
    var seg = Math.max(0, Math.round((Date.now() - start) / 1000));
    var col = ensureDuracionHeader_(sheet);
    sheet.getRange(fila, col).setValue(seg);
  } catch (e) {
    console.warn("No se pudo escribir duración: " + e.toString());
  }
}

// --- HELPERS ---
function isJson(str) { try { JSON.parse(str); } catch (e) { return false; } return true; }

function safeParse(val) {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch(e) { return []; }
}

/**
 * Lista nombres de ficheros bajo una carpeta (incluye subcarpetas: DOCUMENTACION, REQUERIMIENTO_N, …).
 */
function listFileNamesRecursive_(folder, out) {
  out = out || [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    out.push(files.next().getName());
  }
  var folders = folder.getFolders();
  while (folders.hasNext()) {
    listFileNamesRecursive_(folders.next(), out);
  }
  return out;
}

/**
 * Carpeta del expediente: tras renombrar es id_registro; si no, id_envio temporal.
 */
function findCarpetaExpedienteAdjuntos_(muniCode, idEnvio, idRegistro) {
  var raiz = DriveApp.getFolderById(CARPETA_RAIZ_ADJUNTOS_ID);
  var munCode = String(muniCode || "").slice(-3);
  if (!munCode) return null;

  var itMun = raiz.getFoldersByName(munCode);
  if (!itMun.hasNext()) return null;
  var carpetaMun = itMun.next();

  if (idRegistro) {
    var itReg = carpetaMun.getFoldersByName(String(idRegistro));
    if (itReg.hasNext()) return itReg.next();
  }
  if (idEnvio) {
    var itEnv = carpetaMun.getFoldersByName(String(idEnvio));
    if (itEnv.hasNext()) return itEnv.next();
  }
  return null;
}

/** Deduplica nombres conservando el orden (trim; ignora vacíos). */
function dedupeAdjuntoNames_(names) {
  var out = [];
  var seen = {};
  (names || []).forEach(function (n) {
    var name = String(n == null ? "" : n).trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  });
  return out;
}

/**
 * Extrae la lista de nombres de adjuntos del payload.
 * Preferencia: array JSON (lista_archivos / archivos_adjuntos_json).
 * Si llega string, SOLO se parte por saltos de línea — nunca por comas
 * (los PDF de obras suelen llamarse "Informe, final.pdf", etc.).
 */
function parseNombresAdjuntos_(data) {
  data = data || {};
  var raw =
    data.lista_archivos != null
      ? data.lista_archivos
      : data.archivos_adjuntos_json != null
        ? data.archivos_adjuntos_json
        : null;

  if (Array.isArray(raw)) {
    return dedupeAdjuntoNames_(raw);
  }

  if (typeof raw === "string" && raw.trim()) {
    var t = raw.trim();
    if (t.charAt(0) === "[") {
      try {
        var parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return dedupeAdjuntoNames_(parsed);
      } catch (e) {
        /* seguir con split */
      }
    }
    return dedupeAdjuntoNames_(t.split(/\r?\n/));
  }

  var s = data.archivos_adjuntos || "";
  if (typeof s !== "string") s = String(s || "");
  if (!s.trim()) return [];
  // Una sola línea (aunque lleve comas) = un solo nombre.
  if (s.indexOf("\n") === -1 && s.indexOf("\r") === -1) {
    return dedupeAdjuntoNames_([s]);
  }
  return dedupeAdjuntoNames_(s.split(/\r?\n/));
}

/**
 * Normaliza nombre para comparar cliente ↔ Drive
 * (+/espacios, mayúsculas, caracteres que Drive suele sustituir).
 */
function normalizeAdjuntoName_(name) {
  var s = String(name == null ? "" : name).trim();
  try {
    s = decodeURIComponent(s);
  } catch (e) {
    /* ignore */
  }
  s = s.replace(/\+/g, " ");
  s = s.replace(/[\/\\:\*\?"<>\|]/g, "_");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

/**
 * Nombres declarados que no aparecen en Drive (match normalizado).
 * Consume cada hallazgo como máximo una vez (soporta duplicados).
 */
function missingAdjuntosFromList_(expected, foundNames) {
  var pool = {};
  for (var i = 0; i < foundNames.length; i++) {
    var key = normalizeAdjuntoName_(foundNames[i]);
    if (!key) continue;
    pool[key] = (pool[key] || 0) + 1;
  }
  var missing = [];
  for (var j = 0; j < expected.length; j++) {
    var exp = expected[j];
    var nk = normalizeAdjuntoName_(exp);
    if (nk && pool[nk]) {
      pool[nk]--;
      continue;
    }
    missing.push(exp);
  }
  return missing;
}

/**
 * Comprueba que los adjuntos declarados están en Drive antes del PDF/email.
 * Sin lista (envío sin adjuntos) no hace nada.
 *
 * Política (prioridad: no castigar al técnico si los ficheros ya están):
 * 1. Varios reintentos con backoff (indexación Drive / renombrado carpeta).
 * 2. Match de nombres normalizado (no partir por comas).
 * 3. Si el conteo cuadra y faltan ≤15 % de nombres → aviso en log y CONTINÚA.
 * 4. Si la carpeta no está vacía pero el conteo es inferior → también
 *    CONTINÚA con aviso (subida ya dio OK al cliente).
 * Solo falla de verdad si no hay carpeta o está vacía tras los reintentos.
 */
function assertAdjuntosPresentes_(muniCode, idEnvio, idRegistro, expectedNames) {
  var expected = dedupeAdjuntoNames_(expectedNames || []);
  if (!expected.length) return;

  var sleepsMs = [0, 1500, 2500, 4000, 5000];
  var carpeta = null;
  var found = [];
  var missing = expected.slice();

  for (var attempt = 0; attempt < sleepsMs.length; attempt++) {
    if (sleepsMs[attempt] > 0) Utilities.sleep(sleepsMs[attempt]);

    carpeta = findCarpetaExpedienteAdjuntos_(muniCode, idEnvio, idRegistro);
    if (!carpeta) {
      console.warn(
        "Adjuntos: carpeta no encontrada (intento " +
          (attempt + 1) +
          "/" +
          sleepsMs.length +
          ") id_envio=" +
          idEnvio +
          " id_registro=" +
          idRegistro
      );
      continue;
    }

    found = listFileNamesRecursive_(carpeta, []);
    missing = missingAdjuntosFromList_(expected, found);
    if (!missing.length) {
      console.log(
        "Adjuntos verificados OK: " +
          expected.length +
          " archivo(s) en " +
          carpeta.getName() +
          " (intento " +
          (attempt + 1) +
          ")"
      );
      return;
    }

    console.warn(
      "Adjuntos: faltan por nombre (intento " +
        (attempt + 1) +
        ") missing=" +
        missing.join(" | ") +
        " found=" +
        found.length +
        " expected=" +
        expected.length
    );
  }

  if (!carpeta) {
    throw new Error(
      "No se han encontrado los archivos adjuntos del envío. Vuelva a adjuntarlos e inténtelo de nuevo."
    );
  }

  // Red de seguridad SOLO si el conteo cuadra Y no faltan demasiados
  // nombres (antes: found>=expected bastaba y podía dar PDF OK con
  // ficheros de otro envío / basura en carpeta). Exigimos casi todos.
  if (
    found.length >= expected.length &&
    missing.length <= Math.max(1, Math.floor(expected.length * 0.15))
  ) {
    console.warn(
      "ADJUNTOS OK POR CONTEO (nombres no coinciden al 100%): id_envio=" +
        idEnvio +
        " id_registro=" +
        idRegistro +
        " expected=" +
        expected.length +
        " found=" +
        found.length +
        " missing_names=" +
        missing.join(" | ") +
        " found_names=" +
        found.join(" | ")
    );
    return;
  }

  if (found.length > 0) {
    // Hay adjuntos reales tras una subida que el cliente dio por buena.
    // Preferimos completar PDF/email a forzar reenvío de minutos.
    console.warn(
      "ADJUNTOS OK CON AVISO (carpeta no vacía, conteo inferior): id_envio=" +
        idEnvio +
        " id_registro=" +
        idRegistro +
        " expected=" +
        expected.length +
        " found=" +
        found.length +
        " missing_names=" +
        missing.join(" | ") +
        " found_names=" +
        found.join(" | ")
    );
    return;
  }

  var preview = missing.slice(0, 5).join(", ");
  if (missing.length > 5) preview += "…";
  console.error(
    "ADJUNTOS FALTANTES id_envio=" +
      idEnvio +
      " id_registro=" +
      idRegistro +
      " missing=" +
      missing.join(" | ")
  );
  throw new Error(
    "Faltan archivos adjuntos en el envío (" +
      preview +
      "). Vuelva a subirlos e inténtelo de nuevo."
  );
}

/** Quita prefijos repetidos "Error:" de Exceptions / toString(). */
function cleanErrorText_(err) {
  var s = "";
  if (err && err.message) s = String(err.message);
  else if (err != null) s = String(err);
  s = s.trim();
  while (/^Error:\s*/i.test(s)) {
    s = s.replace(/^Error:\s*/i, "").trim();
  }
  return s || "Error desconocido";
}

var EIEL_CONTACTO_AYUDA = "eiel@geonet.es";

/** Añade contacto de ayuda si el mensaje aún no lo incluye. */
function withAyuda_(msg) {
  var s = String(msg || "").trim();
  if (!s) s = "Ha ocurrido un problema al completar el envío.";
  if (s.toLowerCase().indexOf(EIEL_CONTACTO_AYUDA.toLowerCase()) !== -1) return s;
  return s + " Si necesita ayuda, escriba a " + EIEL_CONTACTO_AYUDA + ".";
}

/**
 * Mensaje para el técnico: genérico (detalle → Logger / logs_errores).
 * Excepción: sesión caducada (el técnico puede actuar).
 */
function friendlyUserMessage_(err) {
  var raw = cleanErrorText_(err);
  var lower = raw.toLowerCase();

  if (lower.indexOf("sesión") !== -1) {
    return withAyuda_(
      "Su sesión no es válida o ha caducado. Cierre sesión, vuelva a entrar e inténtelo de nuevo."
    );
  }
  return withAyuda_(
    "Ha ocurrido un problema al completar el envío. Espere unos segundos e inténtelo de nuevo. Si el problema continúa, escriba a eiel@geonet.es indicando municipio y formulario."
  );
}

// ====================================================================
// MOTOR DE RENDERIZADO HTML
// ====================================================================
function generarHTML(data, tituloFormulario) {
  
  // 1. DEFINICIÓN DE IDENTIDAD VISUAL (COLORES Y ESTILOS)
  var colorPrimary = "#1e3a8a";
  var colorBgHeader = "#f1f5f9"; 
  var colorBorder = "#cbd5e1";

  // 2. COMPONENTES AUXILIARES DE DISEÑO
  function getHtmlGestion(data) {
      if (!data.GESTION_TIPO || data.GESTION_TIPO === "No indicado" || data.GESTION_TIPO === "") return "";
      
      let html = `<div class="box" style="margin-bottom: 20px; background-color: #f8fafc; border-left: 4px solid #64748b;">
        <h4 style="margin-top:0; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">💼 Gestión del Servicio</h4>
        <table style="width:100%; font-size:12px;">
            <tr>
                <td style="width:40%; padding:4px; color:#555;">Modelo de Gestión:</td>
                <td style="padding:4px; font-weight:bold;">${data.GESTION_TIPO}</td>
            </tr>`;
      
      // Caso 1: Gestión Indirecta (Lleva empresa y técnicos)
      if (data.GESTION_TIPO === 'Indirecta (Concesionaria)') {
          html += `<tr>
                <td style="padding:4px; color:#555;">Empresa / Ente:</td>
                <td style="padding:4px; font-weight:bold;">${data.GESTION_EMPRESA || 'No indicado'}</td>
            </tr>
            <tr>
                <td colspan="2" style="padding:10px 4px 4px 4px; border-top:1px dashed #e2e8f0;">
                    <strong style="color:#334155;">Contacto Técnico:</strong><br>
                    <span style="color:#555;">
                        👤 ${data.GESTION_TEC_NOMBRE || 'No indicado'} 
                        ${data.GESTION_TEC_TEL ? `&nbsp; 📞 ${data.GESTION_TEC_TEL}` : ''} 
                        ${data.GESTION_TEC_EMAIL ? `&nbsp; ✉️ ${data.GESTION_TEC_EMAIL}` : ''}
                    </span>
                </td>
            </tr>`;
      } 
      // Caso 2: Gestión "Otro" (Solo lleva el nombre del gestor)
      else if (data.GESTION_TIPO === 'Otro') {
          html += `<tr>
                <td style="padding:4px; color:#555;">Gestor específico:</td>
                <td style="padding:4px; font-weight:bold;">${data.GESTION_OTRO || '-'}</td>
            </tr>`;
      }

      html += `</table></div>`;
      return html;
  }
  
  var detalles = "";

  // 3. CONSTRUCCIÓN DE BLOQUES ESPECÍFICOS POR FORMULARIO

  // --- AGUA ---
  if (data.TIPO_FORMULARIO === "agua") {
    detalles += `<h3>ABASTECIMIENTO DE AGUA</h3>`;
    detalles += getHtmlGestion(data); 
    detalles += `<div class="box"><strong>Consumo Anual reportado:</strong> ${data.CONSUMO_ANUAL} m³</div>`;
    
    if (data.DEPOSITOS.length > 0) {
      // Definimos anchos fijos para que la tabla sea estable: 15% Cód, 60% Nombre, 25% Limpieza
      detalles += `<table class="data-table"><thead><tr><th width="15%">Cód</th><th width="60%">Depósito</th><th width="25%">Estado Limpieza</th></tr></thead><tbody>`;
      data.DEPOSITOS.forEach(d => {
        detalles += `<tr>
          <td style="color:#64748b; font-family:monospace; font-size:10px;">${d.codigo || '-'}</td>
          <td>${d.nombre}</td>
          <td style="text-align:center;">${d.limpieza || '-'}</td>
        </tr>`;
      });
      detalles += `</tbody></table>`;
    }

    if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
        detalles += `<h4 style="color:#475569; margin-top:20px;">RESPUESTAS A REQUERIMIENTOS</h4>`;
        data.DATOS_REQUERIMIENTOS.forEach(r => {
            detalles += `<div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a;">
                <div style="font-size:10px; color:#64748b;">REQUERIMIENTO:</div>
                <div style="font-weight:bold;">${r.pregunta}</div>
                <div style="font-size:10px; color:#64748b; margin-top:5px;">RESPUESTA:</div>
                <div style="font-style:italic;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a; margin-top:5px;">📎 Adjuntos: ${r.archivos}</div>` : ""}
            </div>`;
        });
    }
  }
  
  // --- OBRAS ---
  else if (data.TIPO_FORMULARIO === "obras") {
    detalles += `<h3>SEGUIMIENTO DE OBRAS</h3>`;
    
    if (data.DATOS_OBRAS && data.DATOS_OBRAS.length > 0) {
      detalles += `<table class="data-table"><thead>
        <tr><th width="15%">Orden</th><th width="45%">Denominación</th><th width="15%">Estado</th><th width="25%">Docs</th></tr>
      </thead><tbody>`;
      
      data.DATOS_OBRAS.forEach(o => {
        let docsHtml = o.archivos ? `<ul style='margin:0; padding-left:15px; font-size:0.85em; color:#475569;'>${o.archivos.split(";").map(f => `<li>${f}</li>`).join('')}</ul>` : "-";
        let estadoHtml = o.modificado ? `<strong>${o.estado}</strong>` : o.estado;
        if (o.contacto_dpto) {
          const contactoSeguro = String(o.contacto_dpto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
          estadoHtml += `<br><span style="font-size:0.8em; color:#475569;">Contacto: ${contactoSeguro}</span>`;
        }

        detalles += `<tr>
          <td><span style="font-size:0.9em; color:#666">${o.orden || ''}</span></td>
          <td>${o.nombre}<br><span style="font-size:0.8em; color:#666">${o.plan || ''}</span></td>
          <td style="text-align:center;">${estadoHtml}</td>
          <td>${docsHtml}</td>
        </tr>`;
      });
      detalles += `</tbody></table>`;
    } else {
      detalles += `<p>No se han registrado cambios en obras oficiales.</p>`;
    }

    if (data.DATOS_OTRAS_OBRAS && data.DATOS_OTRAS_OBRAS.length > 0) {
      detalles += `<h3 style="margin-top:30px; border-left-color: #64748b; color: #475569;">OTRAS OBRAS DETECTADAS</h3>`;
      detalles += `<table class="data-table"><thead>
        <tr>
          <th width="30%">Denominación de la Obra</th>
          <th width="15%">Estado</th>
          <th width="30%">Observaciones</th>
          <th width="25%">Documentación Adjunta</th>
        </tr>
      </thead><tbody>`;
      
      data.DATOS_OTRAS_OBRAS.forEach(o => {
        let docsHtml = o.archivos ? `<ul style='margin:0; padding-left:15px; font-size:0.85em; color:#475569;'>${o.archivos.split(";").map(f => `<li>${f}</li>`).join('')}</ul>` : "-";
        // Procesamos las observaciones para que respeten los saltos de línea si los hay
        let obsTexto = o.observaciones ? o.observaciones.replace(/\n/g, "<br>") : "-";

        detalles += `<tr>
          <td><strong>${o.nombre}</strong></td>
          <td style="text-align:center;"><b>${o.estado || '-'}</b></td>
          <td style="font-size:0.9em; color:#334155;">${obsTexto}</td>
          <td>${docsHtml}</td>
        </tr>`;
      });
      detalles += `</tbody></table>`;
    }

    if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
      detalles += `<h3 style="margin-top:30px; color:#475569;">RESPUESTAS A REQUERIMIENTOS</h3>`;
      data.DATOS_REQUERIMIENTOS.forEach(r => {
        detalles += `
        <div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a; background-color: #f0f9ff;">
            <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Requerimiento solicitado:</div>
            <div style="font-weight:bold; color: #1e3a8a; margin-bottom:5px;">${r.pregunta}</div>
            <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Respuesta aportada:</div>
            <div style="font-style:italic; color: #334155;">${r.respuesta || "(Sin aclaración de texto, ver adjuntos)"}</div>
            ${r.archivos ? `<div style="font-size:11px; color:#1e3a8a; margin-top:8px; padding-top:5px; border-top:1px dashed #cbd5e1;">📎 <b>Documentación asociada:</b> ${r.archivos}</div>` : ""}
        </div>`;
      });
    }
  }
  
  // --- RESIDUOS ---
  else if (data.TIPO_FORMULARIO === "residuos") {
    detalles += `<h3>GESTIÓN DE RESIDUOS</h3>`;
    detalles += `<p><strong>Personal Limpieza Viaria:</strong> ${data.PERSONAS_LIMPIEZA}</p>`;
    
    if (data.RESIDUOS_DATA.length > 0) {
      detalles += `<table class="data-table"><thead><tr><th>Tipo</th><th>Producción</th><th>Contenedores</th><th>Frecuencia</th><th>Destino</th></tr></thead><tbody>`;
      data.RESIDUOS_DATA.forEach(r => {
        detalles += `
        <tr>
          <td><b>${r.tipo}</b></td>
          <td>${r.produccion || '-'}</td>
          <td>${r.contenedores || '-'}</td>
          <td>${r.periodicidad || '-'}</td>
          <td>${r.vertedero || '-'}</td>
        </tr>`;
      });
      detalles += `</tbody></table>`;
    }

    if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
        detalles += `<h4 style="color:#475569; margin-top:20px;">RESPUESTAS A REQUERIMIENTOS</h4>`;
        data.DATOS_REQUERIMIENTOS.forEach(r => {
            detalles += `<div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a; background-color: #f0f9ff;">
                <div style="font-size:10px; color:#64748b;">REQUERIMIENTO:</div>
                <div style="font-weight:bold;">${r.pregunta}</div>
                <div style="font-size:10px; color:#64748b; margin-top:5px;">RESPUESTA:</div>
                <div style="font-style:italic;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a; margin-top:5px;">📎 Adjuntos: ${r.archivos}</div>` : ""}
            </div>`;
        });
    }
  }

  // --- CEMENTERIOS ---
  else if (data.TIPO_FORMULARIO === "cementerios") {
      detalles += `<h3>CEMENTERIOS</h3>`;
      
      if (data.CEMENTERIOS_DATA && data.CEMENTERIOS_DATA.length > 0) {
        data.CEMENTERIOS_DATA.forEach(c => {
            // 1. Cálculo matemático de totales por columna (Fosas, Nichos, Columbarios, Osarios)
            const totalFosas = (Number(c.ocupadas_fosas)||0) + (Number(c.libres_concesion_fosas)||0) + (Number(c.libres_propiedad_fosas)||0) + (Number(c.libres_municipal_fosas)||0);
            const totalNichos = (Number(c.ocupadas_nichos)||0) + (Number(c.libres_concesion_nichos)||0) + (Number(c.libres_propiedad_nichos)||0) + (Number(c.libres_municipal_nichos)||0);
            const totalColumb = (Number(c.ocupadas_columbarios)||0) + (Number(c.libres_concesion_columbarios)||0) + (Number(c.libres_propiedad_columbarios)||0) + (Number(c.libres_municipal_columbarios)||0);
            const totalOsarios = (Number(c.ocupadas_osarios)||0) + (Number(c.libres_concesion_osarios)||0) + (Number(c.libres_propiedad_osarios)||0) + (Number(c.libres_municipal_osarios)||0);

            detalles += `
            <div class="box" style="margin-bottom:25px; border-top: 3px solid #1e3a8a;">
                <h4 style="margin-top:0; color:#1e3a8a; background:#f8fafc; padding:8px;">📍 ${c.nombre}</h4>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th width="30%">ESTADO</th>
                            <th width="17%" style="text-align:center;">FOSAS</th>
                            <th width="17%" style="text-align:center;">NICHOS</th>
                            <th width="18%" style="text-align:center;">COLUMBARIOS</th>
                            <th width="18%" style="text-align:center;">OSARIOS</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><b>Ocupadas</b></td>
                            <td style="text-align:center;">${c.ocupadas_fosas || 0}</td>
                            <td style="text-align:center;">${c.ocupadas_nichos || 0}</td>
                            <td style="text-align:center;">${c.ocupadas_columbarios || 0}</td>
                            <td style="text-align:center;">${c.ocupadas_osarios || 0}</td>
                        </tr>
                        <tr>
                            <td><b>Libres</b> (En concesión)</td>
                            <td style="text-align:center;">${c.libres_concesion_fosas || 0}</td>
                            <td style="text-align:center;">${c.libres_concesion_nichos || 0}</td>
                            <td style="text-align:center;">${c.libres_concesion_columbarios || 0}</td>
                            <td style="text-align:center;">${c.libres_concesion_osarios || 0}</td>
                        </tr>
                        <tr>
                            <td><b>Libres</b> (Propiedad Municipal)</td>
                            <td style="text-align:center;">${c.libres_municipal_fosas || 0}</td>
                            <td style="text-align:center;">${c.libres_municipal_nichos || 0}</td>
                            <td style="text-align:center;">${c.libres_municipal_columbarios || 0}</td>
                            <td style="text-align:center;">${c.libres_municipal_osarios || 0}</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
                            <td>TOTAL</td>
                            <td style="text-align:center;">${totalFosas}</td>
                            <td style="text-align:center;">${totalNichos}</td>
                            <td style="text-align:center;">${totalColumb}</td>
                            <td style="text-align:center;">${totalOsarios}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
        });
      }

      // Sección de Requerimientos
      if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
          detalles += `<h4 style="color:#475569; margin-top:20px;">RESPUESTAS A REQUERIMIENTOS</h4>`;
          data.DATOS_REQUERIMIENTOS.forEach(r => {
              detalles += `
              <div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a; background-color: #f0f9ff;">
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Requerimiento:</div>
                  <div style="font-weight:bold; color:#1e3a8a;">${r.pregunta}</div>
                  <div style="font-size:10px; color:#64748b; margin-top:5px; text-transform:uppercase;">Respuesta:</div>
                  <div style="font-style:italic;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                  ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a; margin-top:5px; padding-top:5px; border-top:1px dashed #cbd5e1;">📎 Adjuntos: ${r.archivos}</div>` : ""}
              </div>`;
          });
      }
  }

    // --- EQUIPAMIENTOS ---
  else if (data.TIPO_FORMULARIO === "equipamientos") {
      detalles += `<h3>EQUIPAMIENTOS</h3>`;
      
      if (data.DATOS_EQUIPAMIENTOS && data.DATOS_EQUIPAMIENTOS.length > 0) {
          const categorias = [...new Set(data.DATOS_EQUIPAMIENTOS.map(e => e.categoria))];
          
          categorias.forEach(cat => {
              detalles += `<div style="margin-top:15px; font-weight:bold; color:${colorPrimary}; border-bottom:1px solid #e2e8f0;">📂 ${cat}</div>`;
              detalles += `<table class="data-table"><thead><tr><th width="60%">Denominación</th><th width="40%">Estado / Observaciones</th></tr></thead><tbody>`;
              
              data.DATOS_EQUIPAMIENTOS.filter(e => e.categoria === cat).forEach(e => {
                  let displayEstado = e.modificado ? `<strong>${e.estado}</strong>` : e.estado;
                  const fotoNueva = e.foto_nueva
                    ? `<div style="font-size:10px; color:#1e3a8a; margin-top:4px;">📷 Foto nueva: ${e.foto_nueva}</div>`
                    : "";
                  detalles += `<tr>
                      <td><b>${e.nombre}</b><br><small>Cód: ${e.id}</small>${fotoNueva}</td>
                      <td>${displayEstado}<br><i>${e.obs || '-'}</i></td>
                  </tr>`;
              });
              detalles += `</tbody></table>`;
          });
      }

      if (data.DATOS_SIN_USO && data.DATOS_SIN_USO.length > 0) {
          detalles += `<h3 style="margin-top:30px; border-left-color: #64748b; color: #475569;">EDIFICIOS PÚBLICOS SIN USO</h3>`;
          detalles += `<table class="data-table"><thead>
            <tr>
              <th width="40%">Denominación / Código</th>
              <th width="20%">¿Tiene uso?</th>
              <th width="40%">Nuevo uso / Aclaraciones</th>
            </tr>
          </thead><tbody>`;
          
          data.DATOS_SIN_USO.forEach(su => {
              let usoTxt = (su.tiene_uso === "SI") ? "<b>SÍ, ya tiene uso</b>" : "No, sigue sin uso";
              const fotoNueva = su.foto_nueva
                ? `<div style="font-size:10px; color:#1e3a8a; margin-top:4px;">📷 Foto nueva: ${su.foto_nueva}</div>`
                : "";
              detalles += `<tr>
                <td><b>${su.nombre}</b><br><small>Cód: ${su.id}</small>${fotoNueva}</td>
                <td style="text-align:center;">${usoTxt}</td>
                <td><i>${su.nuevo_uso || '-'}</i></td>
              </tr>`;
          });
          detalles += `</tbody></table>`;
      }

      if (data.DATOS_NUEVOS_EQUIPAMIENTOS && data.DATOS_NUEVOS_EQUIPAMIENTOS.length > 0) {
          detalles += `<h3 style="margin-top:30px; border-left-color: #64748b; color: #475569;">NUEVOS EQUIPAMIENTOS NOTIFICADOS</h3>`;
          detalles += `<table class="data-table"><thead>
            <tr>
              <th width="20%">Denominación / Dirección</th>
              <th width="15%">Uso(s)</th>
              <th width="10%">Estado</th>
              <th width="35%">Observaciones</th>
              <th width="20%">Documentación</th>
            </tr>
          </thead><tbody>`;
          
          data.DATOS_NUEVOS_EQUIPAMIENTOS.forEach(n => {
              detalles += `<tr>
                <td><b>${n.nombre}</b><br><small>${n.direccion || '-'}</small></td>
                <td>${n.uso || '-'}</td>
                <td style="text-align:center;">${n.estado || '-'}</td>
                <td><i style="font-size: 0.85em;">${n.observaciones || '-'}</i></td>
                <td><small>${n.archivo || '-'}</small></td>
              </tr>`;
          });
          detalles += `</tbody></table>`;
      }

      if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
          detalles += `<h3 style="margin-top:30px; color:#475569;">RESPUESTAS A REQUERIMIENTOS</h3>`;
          data.DATOS_REQUERIMIENTOS.forEach(r => {
              detalles += `<div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a; background-color: #f0f9ff;">
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Requerimiento solicitado:</div>
                  <div style="font-weight:bold; color: #1e3a8a; margin-bottom:5px;">${r.pregunta}</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Respuesta aportada:</div>
                  <div style="font-style:italic; color: #334155;">${r.respuesta || "(Sin aclaración de texto, ver adjuntos)"}</div>
                  ${r.archivos ? `<div style="font-size:11px; color:#1e3a8a; margin-top:8px; padding-top:5px; border-top:1px dashed #cbd5e1;">📎 <b>Documentación asociada:</b> ${r.archivos}</div>` : ""}
              </div>`;
          });
      }
  }

    // --- ALUMBRADO PÚBLICO ---
    else if (data.TIPO_FORMULARIO === "alumbrado") {
        detalles += `<h3>ALUMBRADO PÚBLICO</h3>`;
        if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
            detalles += `<h4 style="color:#475569;">RESPUESTAS A REQUERIMIENTOS</h4>`;
            data.DATOS_REQUERIMIENTOS.forEach(r => {
                detalles += `<div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a;">
                    <div style="font-size:10px; color:#64748b;">REQUERIMIENTO:</div>
                    <div style="font-weight:bold;">${r.pregunta}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:5px;">RESPUESTA:</div>
                    <div style="font-style:italic;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                    ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a;">📎 Adjuntos: ${r.archivos}</div>` : ""}
                </div>`;
            });
        }
    }

    // --- VIARIO ---
    else if (data.TIPO_FORMULARIO === "viario") {
        detalles += `<h3>VIARIO</h3>`;
        if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
            detalles += `<h4 style="color:#475569;">RESPUESTAS A REQUERIMIENTOS</h4>`;
            data.DATOS_REQUERIMIENTOS.forEach(r => {
                detalles += `<div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a;">
                    <div style="font-size:10px; color:#64748b;">REQUERIMIENTO:</div>
                    <div style="font-weight:bold;">${r.pregunta}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:5px;">RESPUESTA:</div>
                    <div style="font-style:italic;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                    ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a; margin-top:5px;">📎 Adjuntos: ${r.archivos}</div>` : ""}
                </div>`;
            });
        } else {
            detalles += `<p>No constan respuestas a requerimientos específicos.</p>`;
        }
    }

    // --- SANEAMIENTO ---
    else if (data.TIPO_FORMULARIO === "saneamiento") {
      detalles += `<h3>SANEAMIENTO Y DEPURACIÓN</h3>`;
    
      detalles += getHtmlGestion(data); 

      if (data.DATOS_REQUERIMIENTOS && data.DATOS_REQUERIMIENTOS.length > 0) {
          detalles += `<h4 style="color:#475569; margin-top:25px;">RESPUESTAS A REQUERIMIENTOS</h4>`;
          data.DATOS_REQUERIMIENTOS.forEach(r => {
              detalles += `
              <div class="box" style="margin-bottom:15px; border-left: 3px solid #1e3a8a;">
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Requerimiento:</div>
                  <div style="font-weight:bold; margin-bottom:5px;">${r.pregunta}</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Respuesta:</div>
                  <div style="font-style:italic; color:#334155;">${r.respuesta || "(Aportada documentación adjunta)"}</div>
                  ${r.archivos ? `<div style="font-size:10px; color:#1e3a8a; margin-top:8px; padding-top:5px; border-top:1px dashed #cbd5e1;">📎 <b>Adjuntos:</b> ${r.archivos}</div>` : ""}
              </div>`;
          });
      }
    }

  // 4. ENSAMBLAJE DEL DOCUMENTO FINAL
  var html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; line-height: 1.5; padding: 20px; font-size: 14px; }
        .header { border-bottom: 3px solid ${colorPrimary}; padding-bottom: 20px; margin-bottom: 30px; display: table; width: 100%; }
        .header-text { display: table-cell; vertical-align: middle; padding-left: 20px; }
        .title { color: ${colorPrimary}; font-size: 22px; font-weight: bold; text-transform: uppercase; margin: 0; }
        .subtitle { color: #666; font-size: 12px; margin: 5px 0 0 0; }
        .id-destacado { color: #e11d48 !important; font-size: 15px !important; }
        
        .meta-box { background-color: ${colorBgHeader}; border: 1px solid ${colorBorder}; border-radius: 6px; padding: 15px; margin-bottom: 25px; }
        .meta-table { width: 100%; border-collapse: collapse; }
        .meta-table td { padding: 5px; vertical-align: top; }
        .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.5px; }
        .value { font-size: 14px; font-weight: 600; color: #0f172a; }

        h3 { border-left: 4px solid ${colorPrimary}; padding-left: 10px; color: ${colorPrimary}; margin-top: 30px; }
        .box { background: #fff; border: 1px solid ${colorBorder}; padding: 10px; border-radius: 4px; }
        
        .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        .data-table th { background-color: #e2e8f0; text-align: left; padding: 8px; border-bottom: 2px solid ${colorBorder}; color: #334155; text-transform: uppercase; font-size: 11px; }
        .data-table td { padding: 8px; border-bottom: 1px solid ${colorBorder}; vertical-align: top; }
        .data-table tr:nth-child(even) { background-color: #f8fafc; }
        
        .obs-section { margin-top: 30px; background-color: #fff7ed; border: 1px solid #fed7aa; padding: 15px; border-radius: 6px; }
        .obs-title { color: #9a3412; font-weight: bold; font-size: 12px; margin-bottom: 5px; }
        .obs-text { font-style: italic; color: #555; }
        
        .footer { margin-top: 50px; border-top: 1px solid #eee; padding-top: 15px; font-size: 10px; color: #999; text-align: center; }
      </style>
    </head>
    <body>
      
      ${data.IS_TEST ? `
        <div style="background-color: #fee2e2; color: #b91c1c; padding: 12px; text-align: center; font-weight: bold; border: 2px solid #b91c1c; margin-bottom: 20px; border-radius: 4px;">
            ⚠️ DOCUMENTO DE PRUEBA - SIN VALIDEZ OFICIAL ⚠️
        </div>
      ` : ""}

      <div class="header">
        <div class="header-text">
           <h1 class="title">${data.IS_TEST ? "(TEST) " : ""}Justificante de Registro</h1>
           <p class="subtitle">Encuesta de Infraestructuras y Equipamientos Locales (EIEL) | <strong>Fase ${data.FASE}</strong></p>
        </div>
      </div>

      <div class="meta-box">
        <table class="meta-table">
          <tr>
            <td width="33%"><div class="label">ID REGISTRO</div><div class="value id-destacado">${data.ID_REGISTRO}</div></td>
            <td width="33%"><div class="label">Municipio</div><div class="value">${data.MUNI_NOMBRE} (${data.MUNI_CODIGO})</div></td>
            <td width="33%"><div class="label">Formulario</div><div class="value">${tituloFormulario.toUpperCase()}</div></td>
          </tr>
          <tr>
            <td style="padding-top:15px">
               <div class="label">Técnico Responsable (Firmante)</div>
               <div class="value">${data.NOMBRE_CONTACTO}</div>
               <div style="font-size:11px; color:#666">${data.DEPARTAMENTO_CONTACTO}</div>
            </td>
            <td style="padding-top:15px">
               <div class="label">Fecha Registro</div>
               <div class="value">${data.FECHA_ENVIO}</div>
               <div style="font-size:11px; color:#666">${data.EMAIL_CONTACTO}</div>
            </td>
          </tr>
        </table>
      </div>

      ${detalles}

      <div class="obs-section">
        <div class="obs-title">📝 OBSERVACIONES Y COMENTARIOS</div>
        <div class="obs-text">${data.OBSERVACIONES ? data.OBSERVACIONES.replace(/\\n/g, "<br>") : "Sin observaciones."}</div>
      </div>
      
      ${(data.NOMBRES_ADJUNTOS.length > 0 && data.TIPO_FORMULARIO !== "obras") ? `
      <div style="margin-top:20px;">
        <h3>📎 Archivos Adjuntos</h3>
        <ul style="font-size:12px; color:#555;">
          ${data.NOMBRES_ADJUNTOS.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>` : ''}
      
      <div class="footer">
        Documento generado automáticamente por la plataforma EIEL.<br>
        Diputación Provincial de Alicante - Geonet Territorial SAU
      </div>

    </body>
    </html>
  `;
  
  return html;
}


function testPermisos() {
  GmailApp.getAliases();
  console.log("Permisos concedidos");
}