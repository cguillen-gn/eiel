/**
 * EIEL — Worker de login
 *
 * Contrato (igual que appscript/login.gs):
 *   POST { codigo, password }
 *   → { success, valid, nombre, isTest }
 *
 * Extra:
 *   GET  ?action=ping
 *   POST { action: "sync_credenciales", secret, credenciales }  (protegido)
 *
 * Credenciales en KV (clave "credenciales"):
 *   { "006": { "clave": "...", "nombre": "Alcalalí" }, ... }
 */

const KV_KEY = "credenciales";
const VERSION = "eiel-login-worker-20260819a";

const DEFAULT_ORIGINS = [
  "https://eiel.diputacionalicante.es",
  "https://cguillen-gn.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null" // apertura file:// en pruebas locales
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (request.method === "GET") {
        return handleGet(request, env, cors);
      }
      if (request.method === "POST") {
        return await handlePost(request, env, cors, ctx);
      }
      return json({ success: false, message: "Método no permitido." }, 405, cors);
    } catch (err) {
      return json(
        { success: false, message: "Error interno: " + String(err && err.message ? err.message : err) },
        500,
        cors
      );
    }
  }
};

function handleGet(request, env, cors) {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") || "").toLowerCase();
  if (action === "ping") {
    return json(
      {
        status: "success",
        service: "eiel-login",
        version: VERSION,
        has_kv: Boolean(env.CREDENTIALS_KV),
        has_master: Boolean(env.MASTER_PASS)
      },
      200,
      cors
    );
  }
  return json(
    { success: false, message: "Use POST {codigo,password} o GET ?action=ping." },
    400,
    cors
  );
}

async function handlePost(request, env, cors, ctx) {
  let data = {};
  const text = await request.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    return json({ success: false, message: "JSON inválido." }, 400, cors);
  }

  const action = String(data.action || "").toLowerCase();
  if (action === "sync_credenciales" || action === "sync") {
    return await handleSync(data, env, cors);
  }

  // Rate limit suave por IP (mejorable con reglas de CF)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limited = await hitRateLimit(env, ip);
  if (limited) {
    return json(
      { success: false, message: "Demasiados intentos. Espere un minuto." },
      429,
      cors
    );
  }

  const codigoInput = String(data.codigo || "").trim();
  const passwordInput = String(data.password || "").trim();

  if (!codigoInput || !passwordInput) {
    return json(
      { success: true, valid: false, nombre: "", isTest: false },
      200,
      cors
    );
  }

  const master = env.MASTER_PASS ? String(env.MASTER_PASS) : "";
  if (master && timingSafeEqualStr(passwordInput, master)) {
    const map = await loadCredenciales(env);
    const row = map[codigoInput] || map[normalizeCodigo(codigoInput)];
    const nombre = row && row.nombre ? row.nombre : "Municipio Desconocido";
    return json(
      { success: true, valid: true, nombre: nombre, isTest: true },
      200,
      cors
    );
  }

  const map = await loadCredenciales(env);
  const row = map[codigoInput] || map[normalizeCodigo(codigoInput)];
  if (row && row.clave && timingSafeEqualStr(passwordInput, String(row.clave))) {
    return json(
      {
        success: true,
        valid: true,
        nombre: row.nombre || "",
        isTest: false
      },
      200,
      cors
    );
  }

  return json(
    { success: true, valid: false, nombre: "", isTest: false },
    200,
    cors
  );
}

async function handleSync(data, env, cors) {
  const expected = env.SYNC_SECRET ? String(env.SYNC_SECRET) : "";
  if (!expected || !timingSafeEqualStr(String(data.secret || ""), expected)) {
    return json({ success: false, message: "No autorizado." }, 401, cors);
  }
  if (!env.CREDENTIALS_KV) {
    return json({ success: false, message: "KV no configurado." }, 500, cors);
  }
  const cred = data.credenciales || data.credentials;
  if (!cred || typeof cred !== "object" || Array.isArray(cred)) {
    return json(
      { success: false, message: "Falta objeto credenciales { codigo: { clave, nombre } }." },
      400,
      cors
    );
  }
  const cleaned = {};
  let n = 0;
  for (const [codeRaw, val] of Object.entries(cred)) {
    const code = String(codeRaw || "").trim();
    if (!code || !val || typeof val !== "object") continue;
    cleaned[code] = {
      clave: String(val.clave != null ? val.clave : val.password || "").trim(),
      nombre: String(val.nombre != null ? val.nombre : val.name || "").trim()
    };
    n += 1;
  }
  await env.CREDENTIALS_KV.put(KV_KEY, JSON.stringify(cleaned));
  return json({ success: true, message: "Credenciales actualizadas.", count: n }, 200, cors);
}

async function loadCredenciales(env) {
  if (!env.CREDENTIALS_KV) return {};
  const raw = await env.CREDENTIALS_KV.get(KV_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function hitRateLimit(env, ip) {
  if (!env.CREDENTIALS_KV) return false;
  const key = "rl:" + ip;
  const minute = Math.floor(Date.now() / 60000);
  const fullKey = key + ":" + minute;
  try {
    const cur = parseInt((await env.CREDENTIALS_KV.get(fullKey)) || "0", 10) || 0;
    // ~30 intentos / minuto / IP (login municipal)
    if (cur >= 30) return true;
    await env.CREDENTIALS_KV.put(fullKey, String(cur + 1), { expirationTtl: 120 });
  } catch (e) {
    return false;
  }
  return false;
}

function normalizeCodigo(raw) {
  let s = String(raw == null ? "" : raw).trim().replace(/^'/, "");
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  if (digits.length < 3) return digits.padStart(3, "0");
  if (digits.length > 3) return digits.slice(-3);
  return digits;
}

function timingSafeEqualStr(a, b) {
  const aa = String(a);
  const bb = String(b);
  const len = Math.max(aa.length, bb.length);
  let out = 0;
  for (let i = 0; i < len; i++) {
    const ca = i < aa.length ? aa.charCodeAt(i) : 0;
    const cb = i < bb.length ? bb.charCodeAt(i) : 0;
    out |= ca ^ cb;
  }
  return aa.length === bb.length && out === 0;
}

function allowedOrigins(env) {
  const extra = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return DEFAULT_ORIGINS.concat(extra);
}

function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const ok =
    !origin ||
    allowed.includes(origin) ||
    allowed.includes("*");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
