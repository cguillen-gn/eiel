// ====================================================================
// EIEL — Token de sesión firmado (HMAC)
// ====================================================================
// Pegar este archivo COMO SEGUNDO FICHERO en los 3 proyectos Apps Script:
//   1) Login   2) Adjuntos   3) Generar PDF
// El secreto DEBE ser idéntico en los tres (o configurar la misma
// propiedad de script EIEL_TOKEN_SECRET en cada proyecto).
// ====================================================================

/** TTL del token (12 horas). */
var EIEL_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Secreto HMAC. Preferir Script Properties → EIEL_TOKEN_SECRET.
 * Si no está, usa el fallback (cámbialo y mantenlo igual en los 3 proyectos).
 */
function getEielTokenSecret_() {
  try {
    var fromProps = PropertiesService.getScriptProperties().getProperty("EIEL_TOKEN_SECRET");
    if (fromProps && String(fromProps).length >= 16) return String(fromProps);
  } catch (ignore) {}
  // Fallback compartido — cambiar en producción y sincronizar en login/adjuntos/PDF
  return "eiel-geonet-token-secret-cambiar-2026";
}

/**
 * Emite token: base64url(payload).base64url(hmac)
 * payload: { v:1, m: municipio3, t: isTest, e: expMs }
 */
function issueSessionToken_(muniCode, isTest) {
  var exp = Date.now() + EIEL_TOKEN_TTL_MS;
  var body = JSON.stringify({
    v: 1,
    m: String(muniCode || "").slice(-3),
    t: !!isTest,
    e: exp
  });
  var payload = Utilities.base64EncodeWebSafe(body);
  var sigBytes = Utilities.computeHmacSha256Signature(payload, getEielTokenSecret_());
  var sig = Utilities.base64EncodeWebSafe(sigBytes);
  return payload + "." + sig;
}

/**
 * Valida token y municipio esperado. Lanza Error si no vale.
 * @return {Object} payload decodificado
 */
function assertValidSessionToken_(token, expectedMuniCode) {
  // Mensaje único: problema + solución (+ el caller puede añadir contacto)
  var msgSesion =
    "Su sesión no es válida o ha caducado. Cierre sesión, vuelva a entrar e inténtelo de nuevo.";

  if (!token || typeof token !== "string" || token.indexOf(".") < 0) {
    throw new Error(msgSesion);
  }
  var parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error(msgSesion);
  }
  var payload = parts[0];
  var sigB64 = parts[1];
  var expectedSig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getEielTokenSecret_())
  );
  if (sigB64 !== expectedSig) {
    throw new Error(msgSesion);
  }

  var data;
  try {
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString(
      "UTF-8"
    );
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(msgSesion);
  }

  if (!data || data.v !== 1 || !data.e) {
    throw new Error(msgSesion);
  }
  if (Date.now() > Number(data.e)) {
    throw new Error(msgSesion);
  }

  var expected = String(expectedMuniCode || "").slice(-3);
  if (expected && data.m !== expected) {
    throw new Error(
      "La sesión no corresponde a este municipio. Cierre sesión, seleccione el municipio correcto e inicie sesión de nuevo."
    );
  }
  return data;
}
