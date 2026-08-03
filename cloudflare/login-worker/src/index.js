/**
 * EIEL Login — Cloudflare Worker
 *
 * Sustituye al Web App de Apps Script para el login.
 * Lee la hoja de credenciales con Sheets API (service account).
 * Respuesta compatible con el portal: { success, valid, nombre, isTest }.
 *
 * Secretos (wrangler secret put …):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON completo de la cuenta de servicio
 *   MASTER_PASS                  — opcional; modo pruebas
 *
 * Vars (wrangler.toml [vars] o dashboard):
 *   SHEET_ID                     — id de la hoja de credenciales
 *   SHEET_RANGE                  — p.ej. "Hoja 1!A:C"
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min en memoria del isolate

/** @type {{ rows: string[][], fetchedAt: number } | null} */
let credCache = null;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "GET") {
      return json({ ok: true, service: "eiel-login" });
    }

    if (request.method !== "POST") {
      return json({ success: false, message: "Método no permitido" }, 405);
    }

    try {
      const raw = await request.text();
      const data = JSON.parse(raw || "{}");
      const codigoInput = String(data.codigo || "").trim();
      const passwordInput = String(data.password || "").trim();

      if (!codigoInput || !passwordInput) {
        return json({
          success: true,
          valid: false,
          nombre: "",
          isTest: false,
        });
      }

      const master = (env.MASTER_PASS || "").trim();
      if (master && passwordInput === master) {
        const rows = await getCredentialRows(env);
        const nombre = findNombre(rows, codigoInput) || "Municipio Desconocido";
        return json({
          success: true,
          valid: true,
          nombre,
          isTest: true,
        });
      }

      const rows = await getCredentialRows(env);
      for (let i = 1; i < rows.length; i++) {
        const rowCode = String(rows[i][0] || "").trim();
        const rowPass = String(rows[i][1] || "").trim();
        if (rowCode === codigoInput && rowPass === passwordInput) {
          return json({
            success: true,
            valid: true,
            nombre: String(rows[i][2] || "").trim(),
            isTest: false,
          });
        }
      }

      return json({
        success: true,
        valid: false,
        nombre: "",
        isTest: false,
      });
    } catch (err) {
      return json({
        success: false,
        message: String(err && err.message ? err.message : err),
      });
    }
  },
};

function findNombre(rows, codigo) {
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === codigo) {
      return String(rows[i][2] || "").trim();
    }
  }
  return "";
}

async function getCredentialRows(env) {
  const now = Date.now();
  if (credCache && now - credCache.fetchedAt < CACHE_TTL_MS) {
    return credCache.rows;
  }

  const sheetId = env.SHEET_ID;
  const range = env.SHEET_RANGE || "Hoja 1!A:C";
  if (!sheetId) throw new Error("Falta SHEET_ID");
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Falta secreto GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleAccessToken(sa);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const rows = payload.values || [];
  credCache = { rows, fetchedAt: now };
  return rows;
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const unsigned =
    base64url(enc.encode(JSON.stringify(header))) +
    "." +
    base64url(enc.encode(JSON.stringify(claim)));

  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    enc.encode(unsigned)
  );
  const jwt = unsigned + "." + base64url(new Uint8Array(sig));

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`OAuth token ${tokenRes.status}: ${t.slice(0, 200)}`);
  }
  const tok = await tokenRes.json();
  return tok.access_token;
}

async function importPrivateKey(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}
