# Portal EIEL — formularios municipales

Portal estático para que los técnicos de ayuntamientos de Alicante envíen la **Encuesta de Infraestructuras y Equipamientos Locales (EIEL)**: formularios por servicio, adjuntos a Google Drive y justificante PDF.

**Geonet Territorial · Diputación de Alicante**

Despliegue web: **GitHub Pages** (`docs/`).

---

## Cómo funciona hoy

```
Técnico  →  GitHub Pages (HTML/JS)
              │
              ├─ Login ──────────► Cloudflare Worker (workers/login)
              │                      credenciales en KV
              │
              ├─ Adjuntos ───────► Cloudflare Worker (workers/adjuntos)
              │                      PUT binario → Google Drive
              │                      (mismas carpetas que siempre)
              │                      Apps Script = fallback + action=check
              │
              ├─ PDF / email ────► Apps Script (generar-pdf.gs)
              │                      Sheets + Drive + Gmail
              │
              └─ Logs ───────────► Apps Script (logger / log-errores)
```

| Pieza | Dónde | Rol |
|--------|--------|-----|
| Formularios | `docs/*.html` | UI por municipio y servicio |
| Lógica compartida | `js/eiel-forms.js` → `docs/js/` | Subidas, cola, validación, PDF |
| Login | Worker `eiel-login` | Rápido; `login.gs` queda como rollback |
| Adjuntos | Worker `eiel-adjuntos` | Camino principal → Drive |
| Adjuntos (GS) | `adjuntos.gs` | Fallback base64, `check`, `client_log` |
| PDF | `generar-pdf.gs` | Justificante, email, renombrado de carpeta |
| Generación | `gen_forms.py` | Lee PostgreSQL + plantillas → `docs/` |

Detalle de despliegue:

- [`workers/login/README.md`](workers/login/README.md)
- [`workers/adjuntos/README.md`](workers/adjuntos/README.md)
- [`appscript/README.md`](appscript/README.md)
- [`appscript/DESPLIEGUE-ADJUNTOS.md`](appscript/DESPLIEGUE-ADJUNTOS.md)

---

## Estructura del repositorio

```text
├── appscript/           # Código a pegar en Google Apps Script
├── workers/
│   ├── login/           # Cloudflare Worker de login
│   └── adjuntos/        # Cloudflare Worker → Drive
├── templates/           # Jinja2 (fuente de los HTML)
├── js/eiel-forms.js     # Fuente JS (se copia a docs/js/)
├── css/  assets/        # Estilos e imágenes (fuente)
├── data/municipios.tsv  # Listado UI de municipios
├── gen_forms.py         # Genera docs/ desde BD + plantillas
├── docs/                # Lo que sirve GitHub Pages (artefacto)
│   ├── index.html
│   ├── js/eiel-forms.js
│   └── {servicio}_{codigo}.html
├── .env.example         # Plantilla de variables (no secretos reales)
└── README.md
```

**Regla:** editar siempre la **fuente** (`templates/`, `js/`, `css/`, `appscript/`, `workers/`).  
`docs/` se regenera o se sincroniza al desplegar Pages; no es el sitio para cambios “a mano” salvo urgencias puntuales.

---

## Flujo de un envío

1. Login (Worker) → municipio en `localStorage`.
2. El técnico rellena el formulario y adjunta ficheros.
3. Al enviar:
   - Se genera un `id_envio` temporal (`ENVIO_<timestamp>`).
   - El Worker prepara carpetas (`ensure_path`) y sube en cola por tramos  
     (≥8 MB exclusivos; ≥5 MB máx. 2; resto hasta 5).
   - Fotos se comprimen en el navegador.
   - Si el Worker falla tras reintentos → fallback Apps Script (base64).
4. Apps Script PDF crea el id formal (`…` / `TEST-…` en pruebas),  
   fusiona/renombra la carpeta de adjuntos, genera PDF y envía email.
5. Logs en hojas Sheets (pestañas normales o `_pruebas` si `is_test`).

Tokens HMAC de sesión: **desactivados a propósito** (login rápido).  
Seguridad actual = contraseña de municipio + URLs de backend + secretos del Worker.

---

## Regenerar formularios (mantenimiento)

Requisitos: Python 3, acceso PostgreSQL, fichero `.env` (ver `.env.example`).

```bash
# Windows
generate.bat

# o
python gen_forms.py
```

Eso:

- Copia `css/`, `assets/`, `js/` → `docs/`
- Genera los HTML por municipio/servicio desde `templates/`
- Inyecta URLs de Apps Script / Worker desde `.env`

Luego:

```bash
git add docs templates js css appscript workers
git commit -m "chore: regenerar formularios"
git push origin main
```

GitHub Pages publica `docs/` automáticamente.

**Importante:** cambios en Apps Script o Workers **no** los aplica Pages. Hay que:

1. Worker: pegar/desplegar en Cloudflare (`wrangler deploy` o Edit code → Deploy).
2. Apps Script: pegar el `.gs` → **Implementar → Nueva versión** (misma URL `/exec`).

---

## URLs / configuración

| Variable / sitio | Uso |
|------------------|-----|
| `.env` → `URL_ADJUNTOS`, `URL_GENERAR_PDF`, `URL_LOGGER` | Apps Script |
| `.env` → `URL_LOGIN_SCRIPT` | Preferible Worker de login |
| `URL_ADJUNTOS_WORKER` / default en plantillas | Worker de adjuntos |
| Cloudflare secrets | `UPLOAD_SECRET`, OAuth Drive, etc. |
| Apps Script Properties | secretos opcionales (p. ej. token HMAC futuro) |

`.env` está en `.gitignore`. No subir claves de BD, refresh tokens ni JSON de cuenta de servicio.

---

## Seguridad del código en repo público

Tener `appscript/` y `workers/` en GitHub **público no es peligroso por sí solo**: es código de aplicación, igual que cualquier front open source.

| Seguro en el repo | Nunca en el repo |
|-------------------|------------------|
| Lógica `.gs` / Worker | Contraseñas de municipios |
| Estructura de carpetas Drive | `UPLOAD_SECRET`, OAuth refresh token |
| IDs de carpeta Drive (ya hacen falta permisos) | JSON de cuenta de servicio |
| Documentación de despliegue | `.env` real, claves BD |

**Matiz:** las URLs `/exec` de Apps Script y la URL del Worker **ya son públicas** en Pages (`docs/*.html`). Quien las conozca puede intentar invocarlas. Hoy no hay token de sesión obligatorio; es un trade-off consciente. Endurecer = reactivar tokens HMAC o restringir quién puede llamar esos endpoints.

No hace falta sacar el código del repo público para “ocultarlo”: lo sensible son los **secretos** y el control de acceso, no el algoritmo.

---

## Formularios generados

Servicios típicos (según datos en BD y flags por municipio):

- Agua, saneamiento, alumbrado, viario, residuos, cementerios, equipamientos, obras

Cada uno: `{servicio}_{codigoMunicipio}.html` en `docs/`.

---

## Enlaces útiles

- Portal (Pages): configuración del repo → GitHub Pages → carpeta `/docs`
- Worker login: `workers/login/`
- Worker adjuntos: `workers/adjuntos/`
- Apps Script: `appscript/`
