// ====================================================================
// SCRIPT LOGGER (logs_acceso + consulta estados de envío)
// ====================================================================
// Pegar en el proyecto Apps Script de URL_LOGGER y redesplegar
// una NUEVA VERSIÓN (Yo + Cualquiera).
//
// doPost  → registra acceso en logs_acceso
//           Contrato: { status: "success"|"error", message: string }
//
// doGet   → action=estados_envio&codigo=006&fase=2026[&incluir_test=1]
//           Devuelve último envío por tipo en logs_envios (misma hoja).
//           Contrato: { status, codigo, fase, envios: { tipo: { fecha } } }
//
// Si tu hoja usa otro ID o nombre de pestaña, cámbialos abajo.
// ====================================================================

const ID_HOJA_LOGS = "1ZObP1RYX0aG_4wPHdREiYMAzdaRHbr5o9h0HYAp92wM";
const NOMBRE_PESTANA_ACCESOS = "logs_acceso";
const NOMBRE_PESTANA_ENVIOS = "logs_envios";

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function normalizeCodigo_(raw) {
  var codigoRaw = String(raw == null ? "" : raw).trim().replace(/^'/, "");
  var codigoTxt = codigoRaw.replace(/\D/g, "");
  if (codigoTxt.length > 0 && codigoTxt.length < 3) {
    while (codigoTxt.length < 3) codigoTxt = "0" + codigoTxt;
  } else if (codigoTxt.length > 3) {
    codigoTxt = codigoTxt.slice(-3);
  }
  return codigoTxt || codigoRaw;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || "").toLowerCase();
    if (action === "estados_envio" || action === "estados") {
      return handleEstadosEnvio_(p);
    }
    if (action === "ping") {
      return jsonOut_({
        status: "success",
        service: "logger",
        version: "logger-20260806a",
        supports_estados_envio: true
      });
    }
    return jsonOut_({
      status: "error",
      message: "Use action=estados_envio&codigo=…&fase=… o action=ping."
    });
  } catch (fatal) {
    Logger.log("FATAL LOGGER doGet: " + fatal.toString());
    return jsonOut_({
      status: "error",
      message: "Error interno logger: " + fatal.toString()
    });
  }
}

/**
 * Último envío por tipo de formulario para un municipio+fase.
 * Por defecto ignora filas TEST-; pasar incluir_test=1 para ver solo/también pruebas.
 */
function handleEstadosEnvio_(p) {
  var codigo = normalizeCodigo_(p.codigo || p.code || "");
  var faseWanted = String(p.fase || "").trim();
  var incluirTest = String(p.incluir_test || p.test || "0") === "1";

  if (!codigo || !faseWanted) {
    return jsonOut_({
      status: "error",
      message: "Faltan codigo y/o fase."
    });
  }

  var ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
  var sheet = ss.getSheetByName(NOMBRE_PESTANA_ENVIOS);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonOut_({
      status: "success",
      codigo: codigo,
      fase: faseWanted,
      envios: {}
    });
  }

  // A=ID, B=Fecha, C=Municipio, D=Código, E=Fase, F=Tipo
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, lastRow, 6).getValues();
  var latest = {};

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] == null ? "" : row[0]).trim();
    if (!id) continue;

    var isTestRow = id.indexOf("TEST-") === 0;
    if (incluirTest) {
      if (!isTestRow) continue;
    } else if (isTestRow) {
      continue;
    }

    var rowCodigo = normalizeCodigo_(row[3]);
    if (rowCodigo !== codigo) continue;

    var rowFase = String(row[4] == null ? "" : row[4]).trim();
    if (rowFase !== faseWanted) continue;

    var tipo = String(row[5] == null ? "" : row[5])
      .trim()
      .toLowerCase();
    if (!tipo) continue;

    var fechaVal = row[1];
    var fechaMs = 0;
    var fechaIso = "";
    if (fechaVal instanceof Date && !isNaN(fechaVal.getTime())) {
      fechaMs = fechaVal.getTime();
      fechaIso = fechaVal.toISOString();
    } else if (fechaVal) {
      var parsed = new Date(fechaVal);
      if (!isNaN(parsed.getTime())) {
        fechaMs = parsed.getTime();
        fechaIso = parsed.toISOString();
      }
    }

    var prev = latest[tipo];
    if (!prev || fechaMs >= prev._ms) {
      latest[tipo] = { fecha: fechaIso || String(fechaVal || ""), _ms: fechaMs };
    }
  }

  var envios = {};
  Object.keys(latest).forEach(function (tipo) {
    envios[tipo] = { fecha: latest[tipo].fecha };
  });

  return jsonOut_({
    status: "success",
    codigo: codigo,
    fase: faseWanted,
    envios: envios
  });
}

function doPost(e) {
  try {
    return handleLoggerPost_(e);
  } catch (fatal) {
    Logger.log("FATAL LOGGER: " + fatal.toString());
    return jsonOut_({
      status: "error",
      message: "Error interno logger: " + fatal.toString()
    });
  }
}

function handleLoggerPost_(e) {
  const result = { status: "error", message: "" };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibieron datos.");
    }

    var data = {};
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = e.parameter || {};
    }

    var codigoTxt = normalizeCodigo_(data.codigo);

    const fila = [
      new Date(),
      data.municipio || "",
      "'" + codigoTxt,
      data.fase || "",
      data.tipo || "",
      data.contacto || "",
      data.departamento || "",
      data.email || "",
      data.ua || ""
    ];

    const ss = SpreadsheetApp.openById(ID_HOJA_LOGS);
    let sheet = ss.getSheetByName(NOMBRE_PESTANA_ACCESOS);

    if (!sheet) {
      sheet = ss.insertSheet(NOMBRE_PESTANA_ACCESOS);
      sheet.appendRow([
        "Fecha",
        "Municipio",
        "Código",
        "Fase",
        "Tipo",
        "Contacto",
        "Departamento",
        "Email",
        "User-Agent"
      ]);
      sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow(fila);

    result.status = "success";
    result.message = "Acceso registrado.";
  } catch (error) {
    result.status = "error";
    result.message = error.toString();
    Logger.log("ERROR LOGGER: " + error.toString());
  }

  return jsonOut_(result);
}
