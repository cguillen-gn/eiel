// ====================================================================
// SCRIPT DE LOGIN (Apps Script) — LEGACY
// ====================================================================
// Preferir el Cloudflare Worker en workers/login/ (primer acceso rápido).
// Este script se mantiene como rollback: si URL_LOGIN_SCRIPT apunta aquí,
// el portal sigue funcionando como hasta ahora.
//
// Restaurado tal como funcionaba antes de los tokens.
// Tras pegar: Implementar → Nueva versión (misma app web, no crear otra).
// ====================================================================

const ID_HOJA_CREDENCIALES = "1MtFPW_FDMCKaAnMeYRCyr-qnTIyUUOrSOK5N7cj6Hu8";
const NOMBRE_PESTANA = "Hoja 1";

function doPost(e) {
  const output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);

  try {
    const data = JSON.parse(e.postData.contents);

    const codigoInput = String(data.codigo || "").trim();
    const passwordInput = String(data.password || "").trim();

    // 1. OBTENER LA CONTRASEÑA MAESTRA
    const MASTER_PASS = PropertiesService.getScriptProperties().getProperty("MASTER_PASS");

    let loginExitoso = false;
    let nombreMunicipio = "";
    let isTestMode = false;

    // 2. VERIFICACIÓN DE CONTRASEÑA MAESTRA (Prioridad)
    if (MASTER_PASS && passwordInput == MASTER_PASS) {
      loginExitoso = true;
      isTestMode = true;

      // Buscamos el nombre real del municipio seleccionado para no devolver "ADMIN"
      const ss = SpreadsheetApp.openById(ID_HOJA_CREDENCIALES);
      const sheet = ss.getSheetByName(NOMBRE_PESTANA);
      const dataRange = sheet.getDataRange().getValues();

      for (var i = 1; i < dataRange.length; i++) {
        if (String(dataRange[i][0]).trim() == codigoInput) {
          nombreMunicipio = dataRange[i][2]; // Guardamos el nombre real (ej: Adsubia)
          break;
        }
      }
      // Si por lo que sea no lo encuentra en la lista, ponemos un genérico
      if (!nombreMunicipio) nombreMunicipio = "Municipio Desconocido";
    } else {
      // 3. VALIDACIÓN CONTRA EL SPREADSHEET ACTUALIZADO
      const sheet = SpreadsheetApp.openById(ID_HOJA_CREDENCIALES).getSheets()[0];
      const dataRange = sheet.getDataRange().getValues();

      // Empezamos en i=1 para saltar la fila de encabezados (codigo, clave, nombre)
      for (var i = 1; i < dataRange.length; i++) {
        var rowCode = String(dataRange[i][0] || "").trim(); // Columna 'codigo'
        var rowPass = String(dataRange[i][1] || "").trim(); // Columna 'clave'

        // Comparación estricta de texto para evitar fallos de formato
        if (rowCode === codigoInput && rowPass === passwordInput) {
          loginExitoso = true;
          nombreMunicipio = dataRange[i][2]; // Columna 'nombre'
          isTestMode = false;
          break;
        }
      }
    }

    return output.setContent(
      JSON.stringify({
        success: true,
        valid: loginExitoso,
        nombre: nombreMunicipio,
        isTest: isTestMode
      })
    );
  } catch (error) {
    // Detalle técnico en JSON (el front muestra mensaje genérico al usuario).
    return output.setContent(
      JSON.stringify({
        success: false,
        message: error.toString()
      })
    );
  }
}
