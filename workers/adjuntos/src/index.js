/**
 * EIEL — Worker de adjuntos (R2)
 *
 * Flujo:
 *   1) POST { action:"presign", filename, municipio, id_envio, seccion, mimeType, size, is_test }
 *      → { status, key, put_url, get_url, expires_at }
 *   2) PUT put_url  (cuerpo = bytes del fichero, no base64)
 *   3) Apps Script action=import_url con get_url → Drive (carpetas de siempre)
 *
 *   GET ?action=ping
 */

const VERSION = "eiel-adjuntos-worker-20260807a";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_BYTES = 35 * 1024 * 1024;

const DEFAULT_ORIGINS = [
  "https://cguillen-gn.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null"
];

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

      // PUT /u/<token> — subida binaria
      if (request.method === "PUT" && url.pathname.startsWith("/u/")) {
        return await handlePut(request, env, cors, url.pathname.slice(3));
      }

      // GET /d/<token> — descarga para Apps Script (import a Drive)
      if (request.method === "GET" && url.pathname.startsWith("/d/")) {
        return await handleDownload(request, env, cors, url.pathname.slice(3));
      }

      if (request.method === "POST" && url.pathname === "/") {
        return await handlePresign(request, env, cors);
      }

      return json({ status: "error", message: "Ruta o método no permitido." }, 405, cors);
    } catch (err) {
      return json(
        {
          status: "error",
          message: "Error interno: " + String(err && err.message ? err.message : err)
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
      { status: "error", message: "Use GET ?action=ping, POST presign, PUT /u/…, GET /d/…" },
      400,
      cors
    );
  }
  return json(
    {
      status: "success",
      service: "eiel-adjuntos",
      version: VERSION,
      has_bucket: Boolean(env.ADJUNTOS_BUCKET),
      has_secret: Boolean(env.UPLOAD_SECRET),
      max_bytes: MAX_BYTES
    },
    200,
    cors
  );
}

async function handlePresign(request, env, cors) {
  if (!env.ADJUNTOS_BUCKET || !env.UPLOAD_SECRET) {
    return json(
      {
        status: "error",
        message: "Worker mal configurado (falta R2 o UPLOAD_SECRET)."
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

  if (String(data.action || "").toLowerCase() !== "presign") {
    return json(
      { status: "error", message: "Use action=presign." },
      400,
      cors
    );
  }

  const filename = String(data.filename || data.nombre_archivo || "").trim();
  const municipio = String(data.municipio || data.mun || "").trim().slice(-3);
  const idEnvio = String(data.id_envio || "").trim();
  const seccion = String(data.seccion || "DOCUMENTACION").trim() || "DOCUMENTACION";
  const mimeType = String(data.mimeType || "application/octet-stream").trim();
  const size = Number(data.size) || 0;
  const isTest = data.is_test === true || data.is_test === "true";

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
  const key =
    (isTest ? "pruebas/" : "prod/") +
    municipio +
    "/" +
    idEnvio +
    "/" +
    seccion +
    "/" +
    Date.now().toString(36) +
    "_" +
    safeName;

  const exp = Date.now() + TOKEN_TTL_MS;
  const putToken = await signToken(
    env.UPLOAD_SECRET,
    { typ: "put", key, filename: safeName, mimeType, exp, is_test: !!isTest }
  );
  const getToken = await signToken(
    env.UPLOAD_SECRET,
    { typ: "get", key, filename: safeName, mimeType, exp, is_test: !!isTest }
  );

  const base = new URL(request.url).origin;
  return json(
    {
      status: "success",
      key,
      filename: safeName,
      put_url: base + "/u/" + putToken,
      get_url: base + "/d/" + getToken,
      expires_at: new Date(exp).toISOString(),
      eiel_build: VERSION
    },
    200,
    cors
  );
}

async function handlePut(request, env, cors, tokenPath) {
  if (!env.ADJUNTOS_BUCKET || !env.UPLOAD_SECRET) {
    return json({ status: "error", message: "Worker mal configurado." }, 500, cors);
  }
  const payload = await verifyToken(env.UPLOAD_SECRET, decodeURIComponent(tokenPath));
  if (!payload || payload.typ !== "put") {
    return json({ status: "error", message: "Token de subida inválido." }, 403, cors);
  }
  if (Date.now() > Number(payload.exp)) {
    return json({ status: "error", message: "Token de subida caducado." }, 403, cors);
  }

  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength === 0) {
    return json({ status: "error", message: "Cuerpo vacío." }, 400, cors);
  }
  if (buf.byteLength > MAX_BYTES) {
    return json({ status: "error", message: "El archivo supera el límite de 35 MB." }, 400, cors);
  }

  const contentType =
    request.headers.get("Content-Type") || payload.mimeType || "application/octet-stream";

  await env.ADJUNTOS_BUCKET.put(payload.key, buf, {
    httpMetadata: { contentType },
    customMetadata: {
      filename: String(payload.filename || ""),
      is_test: payload.is_test ? "1" : "0"
    }
  });

  return json(
    {
      status: "success",
      message: "Archivo recibido en R2.",
      key: payload.key,
      bytes: buf.byteLength
    },
    200,
    cors
  );
}

async function handleDownload(request, env, cors, tokenPath) {
  if (!env.ADJUNTOS_BUCKET || !env.UPLOAD_SECRET) {
    return json({ status: "error", message: "Worker mal configurado." }, 500, cors);
  }
  const payload = await verifyToken(env.UPLOAD_SECRET, decodeURIComponent(tokenPath));
  if (!payload || payload.typ !== "get") {
    return json({ status: "error", message: "Token de descarga inválido." }, 403, cors);
  }
  if (Date.now() > Number(payload.exp)) {
    return json({ status: "error", message: "Token de descarga caducado." }, 403, cors);
  }

  const obj = await env.ADJUNTOS_BUCKET.get(payload.key);
  if (!obj) {
    return json({ status: "error", message: "Archivo no encontrado en R2." }, 404, cors);
  }

  const headers = new Headers(cors);
  headers.set(
    "Content-Type",
    obj.httpMetadata && obj.httpMetadata.contentType
      ? obj.httpMetadata.contentType
      : payload.mimeType || "application/octet-stream"
  );
  headers.set(
    "Content-Disposition",
    'attachment; filename="' + String(payload.filename || "adjunto").replace(/"/g, "") + '"'
  );
  headers.set("Cache-Control", "no-store");
  return new Response(obj.body, { status: 200, headers });
}

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
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
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
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = allowed.length ? allowed : DEFAULT_ORIGINS;
  const allow = list.indexOf(origin) !== -1 || list.indexOf("*") !== -1 ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors || {})
  });
}
