/**
 * EIEL — Worker de adjuntos → Google Drive (directo)
 *
 * Flujo único (todos los tamaños):
 *   0) POST { action:"ensure_path", municipio, id_envio, secciones[] }
 *      → crea mun / id_envio [/ secciones] una vez (evita carpetas duplicadas)
 *   1) POST { action:"presign", filename, municipio, id_envio, seccion, mimeType, size, is_test }
 *      → { status, put_url, expires_at }
 *   2) PUT put_url  (bytes del fichero)
 *      → Worker sube a Drive (mismas carpetas que Apps Script)
 *
 *   GET ?action=ping
 *
 * Auth Drive (preferido sin admin Workspace):
 *   GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN  — OAuth de usuario
 * Alternativa:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — cuenta de servicio (suele fallar por cuota)
 *
 * Otros:
 *   UPLOAD_SECRET         — firma tokens PUT
 *   DRIVE_ROOT_FOLDER_ID  — carpeta raíz (mismo id que CARPETA_RAIZ_ID en adjuntos.gs)
 */

const VERSION = "eiel-adjuntos-worker-drive-20260819a";
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 35 * 1024 * 1024;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
/** Query común: Shared Drives + My Drive. */
const DRIVE_SUPPORTS =
  "supportsAllDrives=true&includeItemsFromAllDrives=true";

const DEFAULT_ORIGINS = [
  "https://eiel.diputacionalicante.es",
  "https://cguillen-gn.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null"
];

/** Cache en memoria del isolate (access token Google). */
let cachedToken = null;
let cachedTokenExp = 0;
let cachedTokenKey = "";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return handlePing(url, env, cors);
      }

      if (request.method === "PUT" && url.pathname.startsWith("/u/")) {
        return await handlePutToDrive(request, env, cors, url.pathname.slice(3));
      }

      if (request.method === "POST" && url.pathname === "/") {
        return await handlePresign(request, env, cors);
      }

      return json(
        { status: "error", message: "Ruta o método no permitido." },
        405,
        cors
      );
    } catch (err) {
      return json(
        {
          status: "error",
          message:
            "Error interno: " + String(err && err.message ? err.message : err)
        },
        500,
        cors
      );
    }
  }
};

function handlePing(url, env, cors) {
  const action = (url.searchParams.get("action") || "ping").toLowerCase();
  if (action !== "ping" && action !== "version") {
    return json(
      {
        status: "error",
        message: "Use GET ?action=ping, POST presign, PUT /u/…"
      },
      400,
      cors
    );
  }
  const hasOauth = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  return json(
    {
      status: "success",
      service: "eiel-adjuntos",
      mode: "drive_direct",
      version: VERSION,
      has_secret: Boolean(env.UPLOAD_SECRET),
      has_service_account: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      has_oauth_user: hasOauth,
      has_root_folder: Boolean(env.DRIVE_ROOT_FOLDER_ID),
      has_impersonate: Boolean(
        String(env.GOOGLE_IMPERSONATE_USER || "").trim()
      ),
      impersonate: String(env.GOOGLE_IMPERSONATE_USER || "").trim() || null,
      auth_mode: hasOauth
        ? "oauth_user"
        : env.GOOGLE_SERVICE_ACCOUNT_JSON
          ? "service_account"
          : "none",
      max_bytes: MAX_BYTES
    },
    200,
    cors
  );
}

async function handlePresign(request, env, cors) {
  const hasOauth = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  const hasSa = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!env.UPLOAD_SECRET || !env.DRIVE_ROOT_FOLDER_ID || (!hasOauth && !hasSa)) {
    return json(
      {
        status: "error",
        message:
          "Worker mal configurado (faltan UPLOAD_SECRET, DRIVE_ROOT_FOLDER_ID y OAuth de usuario o cuenta de servicio)."
      },
      500,
      cors
    );
  }

  let data = {};
  try {
    const text = await request.text();
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    return json({ status: "error", message: "JSON inválido." }, 400, cors);
  }

  const action = String(data.action || "").toLowerCase();
  if (action === "ensure_path") {
    return handleEnsurePath(env, cors, data);
  }
  if (action !== "presign") {
    return json(
      { status: "error", message: "Use action=presign o action=ensure_path." },
      400,
      cors
    );
  }

  const filename = String(data.filename || data.nombre_archivo || "").trim();
  const municipio = String(data.municipio || data.mun || "").trim().slice(-3);
  const idEnvio = String(data.id_envio || "").trim();
  const seccion =
    String(data.seccion || "DOCUMENTACION").trim() || "DOCUMENTACION";
  const mimeType = String(data.mimeType || "application/octet-stream").trim();
  const size = Number(data.size) || 0;
  const isTest = data.is_test === true || data.is_test === "true";
  const tipo = String(data.tipo || "general").toLowerCase();

  if (!filename || !municipio || !idEnvio) {
    return json(
      {
        status: "error",
        message: "Faltan filename, municipio o id_envio."
      },
      400,
      cors
    );
  }
  if (size > MAX_BYTES) {
    return json(
      {
        status: "error",
        message: "El archivo supera el límite de 35 MB."
      },
      400,
      cors
    );
  }

  const safeName = filename.replace(/[\/\\]/g, "_").slice(0, 180);
  const exp = Date.now() + TOKEN_TTL_MS;
  const putToken = await signToken(env.UPLOAD_SECRET, {
    typ: "drive_put",
    filename: safeName,
    mimeType,
    size,
    municipio,
    id_envio: idEnvio,
    seccion,
    tipo,
    is_test: !!isTest,
    exp
  });

  const base = new URL(request.url).origin;
  return json(
    {
      status: "success",
      filename: safeName,
      put_url: base + "/u/" + putToken,
      expires_at: new Date(exp).toISOString(),
      mode: "drive_direct",
      eiel_build: VERSION
    },
    200,
    cors
  );
}

/**
 * Crea (o reutiliza) mun / id_envio [/ secciones] de forma serial
 * antes de las subidas en paralelo. Evita N carpetas ENVIO_* gemelas.
 */
async function handleEnsurePath(env, cors, data) {
  const municipio = String(data.municipio || data.mun || "")
    .trim()
    .slice(-3);
  const idEnvio = String(data.id_envio || "").trim();
  if (!municipio || !idEnvio) {
    return json(
      { status: "error", message: "Faltan municipio o id_envio." },
      400,
      cors
    );
  }
  let secciones = data.secciones || data.sections || [];
  if (!Array.isArray(secciones)) secciones = [secciones];
  secciones = secciones
    .map(function (s) {
      return String(s || "").trim();
    })
    .filter(Boolean);
  if (!secciones.length && !isEquipamientoId_(idEnvio)) {
    secciones = ["DOCUMENTACION"];
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const munFolder = await getOrCreateFolder_(
      accessToken,
      env.DRIVE_ROOT_FOLDER_ID,
      municipio
    );
    const expFolder = await getOrCreateFolder_(accessToken, munFolder, idEnvio);
    const sectionIds = {};
    if (!isEquipamientoId_(idEnvio)) {
      for (let i = 0; i < secciones.length; i++) {
        const sec = secciones[i];
        sectionIds[sec] = await getOrCreateFolder_(accessToken, expFolder, sec);
      }
    }
    return json(
      {
        status: "success",
        message: "Ruta de carpetas lista.",
        municipio,
        id_envio: idEnvio,
        secciones: sectionIds,
        eiel_build: VERSION
      },
      200,
      cors
    );
  } catch (err) {
    return json(
      {
        status: "error",
        message:
          "No se pudo preparar carpetas: " +
          String(err && err.message ? err.message : err),
        retryable: true
      },
      502,
      cors
    );
  }
}

async function handlePutToDrive(request, env, cors, tokenPath) {
  const hasOauth = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  const hasSa = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!env.UPLOAD_SECRET || !env.DRIVE_ROOT_FOLDER_ID || (!hasOauth && !hasSa)) {
    return json({ status: "error", message: "Worker mal configurado." }, 500, cors);
  }

  const payload = await verifyToken(
    env.UPLOAD_SECRET,
    decodeURIComponent(tokenPath)
  );
  if (!payload || payload.typ !== "drive_put") {
    return json({ status: "error", message: "Token de subida inválido." }, 403, cors);
  }
  if (Date.now() > Number(payload.exp)) {
    return json({ status: "error", message: "Token de subida caducado." }, 403, cors);
  }

  const expectedSize = Number(payload.size) || 0;
  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength === 0) {
    return json({ status: "error", message: "Cuerpo vacío." }, 400, cors);
  }
  if (buf.byteLength > MAX_BYTES) {
    return json(
      { status: "error", message: "El archivo supera el límite de 35 MB." },
      400,
      cors
    );
  }
  // Si el token traía size y el cuerpo difiere un poco, no bloqueamos
  // (tolerancia implícita; el límite duro es MAX_BYTES arriba).

  const mimeType =
    request.headers.get("Content-Type") ||
    payload.mimeType ||
    "application/octet-stream";
  const fileName = String(payload.filename || "adjunto.bin");
  const mun = String(payload.municipio || "").slice(-3);
  const idEnvio = String(payload.id_envio || "");
  const seccion = String(payload.seccion || "DOCUMENTACION") || "DOCUMENTACION";

  try {
    const accessToken = await getGoogleAccessToken(env);
    const destFolderId = await resolveDestFolderId_(
      accessToken,
      env.DRIVE_ROOT_FOLDER_ID,
      mun,
      idEnvio,
      seccion
    );

    const existing = await findChildByName_(accessToken, destFolderId, fileName);
    if (existing && existing.id) {
      const meta = await getFileMeta_(accessToken, existing.id);
      if (meta && meta.id) {
        return json(
          {
            status: "success",
            message: "Archivo ya estaba en Drive (idempotente).",
            fileId: meta.id,
            filename: fileName,
            bytes: buf.byteLength,
            via: "drive_direct_existing",
            eiel_build: VERSION
          },
          200,
          cors
        );
      }
    }

    const created = await uploadResumable_(
      accessToken,
      destFolderId,
      fileName,
      mimeType,
      buf
    );
    if (!created || !created.id) {
      throw new Error("Drive no devolvió id de fichero tras la subida.");
    }
    const verified = await getFileMeta_(accessToken, created.id);
    if (!verified || !verified.id) {
      throw new Error(
        "El fichero se subió pero no se pudo verificar en Drive (id=" +
          created.id +
          ")."
      );
    }

    return json(
      {
        status: "success",
        message: "Archivo guardado en Drive.",
        fileId: verified.id,
        filename: fileName,
        bytes: buf.byteLength,
        via: "drive_direct",
        eiel_build: VERSION
      },
      200,
      cors
    );
  } catch (driveErr) {
    const raw = String(driveErr && driveErr.message ? driveErr.message : driveErr);
    let hint = "";
    if (/storage quota|Service Accounts do not have storage/i.test(raw)) {
      hint =
        " | Sin admin Workspace: configure OAuth de usuario (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN). Ver workers/adjuntos/README.md";
    }
    return json(
      {
        status: "error",
        message: "No se pudo guardar en Drive: " + raw + hint,
        retryable: true
      },
      502,
      cors
    );
  }
}

/* -------------------- Drive helpers -------------------- */

/** ids de equipamiento: sin subcarpeta de sección (paridad con adjuntos.gs). */
function isEquipamientoId_(idEnvio) {
  return (
    idEnvio.indexOf("-E-") !== -1 ||
    idEnvio.indexOf("_E_") !== -1 ||
    idEnvio.indexOf("EXP_E") === 0
  );
}

/**
 * Jerarquía: raíz / mun / id_envio [/ sección].
 * Equipamientos (-E- / _E_ / EXP_E): ficheros directamente bajo id_envio.
 */
async function resolveDestFolderId_(accessToken, rootId, mun, idEnvio, seccion) {
  const munFolder = await getOrCreateFolder_(accessToken, rootId, mun);
  const expFolder = await getOrCreateFolder_(accessToken, munFolder, idEnvio);
  if (isEquipamientoId_(idEnvio)) return expFolder;
  return getOrCreateFolder_(accessToken, expFolder, seccion);
}

async function getOrCreateFolder_(accessToken, parentId, name) {
  const existing = await findCanonicalChildFolder_(accessToken, parentId, name);
  if (existing) return existing.id;

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?" + DRIVE_SUPPORTS,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      })
    }
  );
  const data = await res.json().catch(() => ({}));
  // Tras crear (o si falló por carrera), reconciliar: puede haber
  // varias carpetas con el mismo nombre; la canónica es la más antigua.
  for (let i = 0; i < 5; i++) {
    if (i > 0) await sleepMs_(150 * i);
    const canon = await findCanonicalChildFolder_(accessToken, parentId, name);
    if (canon) return canon.id;
  }
  if (res.ok && data && data.id) return data.id;
  throw new Error(
    "Crear carpeta Drive falló (" +
      res.status +
      "): " +
      (data.error && data.error.message
        ? data.error.message
        : JSON.stringify(data).slice(0, 200))
  );
}

/** Carpeta hija canónica = la más antigua si hay duplicados por carrera. */
async function findCanonicalChildFolder_(accessToken, parentId, name) {
  const all = await listChildFoldersByName_(accessToken, parentId, name);
  return all[0] || null;
}

async function findChildFolder_(accessToken, parentId, name) {
  return findCanonicalChildFolder_(accessToken, parentId, name);
}

async function listChildFoldersByName_(accessToken, parentId, name) {
  const q =
    "'" +
    parentId +
    "' in parents and name = '" +
    escapeDriveQuery_(name) +
    "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const url =
    "https://www.googleapis.com/drive/v3/files?pageSize=25&orderBy=createdTime&fields=files(id,name,createdTime)&" +
    DRIVE_SUPPORTS +
    "&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      "Listar carpetas Drive falló (" +
        res.status +
        "): " +
        (data.error && data.error.message ? data.error.message : "")
    );
  }
  const files = data.files || [];
  files.sort(function (a, b) {
    const ta = a.createdTime || "";
    const tb = b.createdTime || "";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
  return files;
}

function sleepMs_(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function findChildByName_(accessToken, parentId, name) {
  const q =
    "'" +
    parentId +
    "' in parents and name = '" +
    escapeDriveQuery_(name) +
    "' and trashed = false";
  const url =
    "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)&" +
    DRIVE_SUPPORTS +
    "&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      "Listar ficheros Drive falló (" +
        res.status +
        "): " +
        (data.error && data.error.message ? data.error.message : "")
    );
  }
  const files = data.files || [];
  return files[0] || null;
}

function escapeDriveQuery_(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getFileMeta_(accessToken, fileId) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?fields=id,name,size&" +
    DRIVE_SUPPORTS;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      "Verificar fichero Drive falló (" +
        res.status +
        "): " +
        (data.error && data.error.message ? data.error.message : "")
    );
  }
  return data;
}

async function uploadResumable_(accessToken, parentId, fileName, mimeType, buf) {
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name&" +
      DRIVE_SUPPORTS,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(buf.byteLength)
      },
      body: JSON.stringify({
        name: fileName,
        parents: [parentId]
      })
    }
  );
  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(
      "Iniciar subida resumable falló (" +
        initRes.status +
        "): " +
        errText.slice(0, 300)
    );
  }
  const sessionUrl = initRes.headers.get("Location");
  if (!sessionUrl) {
    throw new Error("Drive no devolvió Location de sesión resumable.");
  }

  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(buf.byteLength)
    },
    body: buf
  });
  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(
      "Subida a Drive falló (" +
        putRes.status +
        "): " +
        (putData.error && putData.error.message
          ? putData.error.message
          : JSON.stringify(putData).slice(0, 300))
    );
  }
  return putData;
}

/* -------------------- Google auth -------------------- */

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);

  // Preferido sin admin: OAuth de un usuario real (usa su cuota de Drive).
  if (
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    const cacheKey = "oauth:" + String(env.GOOGLE_OAUTH_CLIENT_ID);
    if (
      cachedToken &&
      cachedTokenExp > now + 60 &&
      cachedTokenKey === cacheKey
    ) {
      return cachedToken;
    }
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        "client_id=" +
        encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_ID) +
        "&client_secret=" +
        encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_SECRET) +
        "&refresh_token=" +
        encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) +
        "&grant_type=refresh_token"
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(
        "OAuth refresh falló (" +
          tokenRes.status +
          "): " +
          (tokenJson.error_description ||
            tokenJson.error ||
            JSON.stringify(tokenJson).slice(0, 200))
      );
    }
    cachedToken = tokenJson.access_token;
    cachedTokenExp = now + (Number(tokenJson.expires_in) || 3600);
    cachedTokenKey = cacheKey;
    return cachedToken;
  }

  // Alternativa: cuenta de servicio (+ impersonación si hay admin Workspace).
  const impersonate = String(env.GOOGLE_IMPERSONATE_USER || "").trim();
  const cacheKey = "sa:" + (impersonate || "(sa)");
  if (
    cachedToken &&
    cachedTokenExp > now + 60 &&
    cachedTokenKey === cacheKey
  ) {
    return cachedToken;
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error(
      "Falta auth Google: configure OAuth de usuario o cuenta de servicio."
    );
  }

  let sa;
  try {
    sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido.");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Cuenta de servicio incompleta (client_email / private_key).");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: DRIVE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  if (impersonate) {
    claim.sub = impersonate;
  }
  const unsigned =
    base64UrlEncode(JSON.stringify(header)) +
    "." +
    base64UrlEncode(JSON.stringify(claim));
  const key = await importPkcs8PrivateKey_(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = unsigned + "." + base64UrlEncode(sigBuf);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(jwt)
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      "OAuth token SA falló (" +
        tokenRes.status +
        "): " +
        (tokenJson.error_description ||
          tokenJson.error ||
          JSON.stringify(tokenJson).slice(0, 200))
    );
  }

  cachedToken = tokenJson.access_token;
  cachedTokenExp = now + (Number(tokenJson.expires_in) || 3600);
  cachedTokenKey = cacheKey;
  return cachedToken;
}

async function importPkcs8PrivateKey_(pem) {
  const cleaned = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/* -------------------- tokens HMAC + utils -------------------- */

async function signToken(secret, payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return body + "." + sig;
}

async function verifyToken(secret, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = await hmacSign(secret, body);
  if (!timingSafeEqualStr(sig, expect)) return null;
  try {
    return JSON.parse(base64UrlDecode(body));
  } catch (e) {
    return null;
  }
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return base64UrlEncode(mac);
}

function base64UrlEncode(input) {
  let bytes;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function timingSafeEqualStr(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

function corsHeaders(origin, env) {
  const extra = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = DEFAULT_ORIGINS.concat(extra);
  const ok =
    !origin || list.indexOf(origin) !== -1 || list.indexOf("*") !== -1;
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
  if (ok) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  }
  return headers;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8" },
      cors || {}
    )
  });
}
