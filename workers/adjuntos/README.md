# Adjuntos EIEL — Cloudflare Worker + R2 → Drive

Subida **rápida** (bytes, no base64) a R2. Después Apps Script **importa a Drive**
con la misma organización de carpetas de siempre
(`municipio / id_envio / sección /…`).

El portal puede seguir usando solo Apps Script hasta que configures la URL del Worker.

```
Navegador ──PUT──► Worker/R2 ──get_url──► Apps Script import_url ──► Drive
```

---

## 1. Crear bucket R2 y Worker (dashboard o CLI)

### Dashboard
1. Cloudflare → **R2** → Create bucket → nombre `eiel-adjuntos`
2. **Workers** → Create → nombre `eiel-adjuntos`
3. Pegar el código de `src/index.js`
4. Settings → **Variables** → añadir binding R2: `ADJUNTOS_BUCKET` → bucket `eiel-adjuntos`
5. Secrets → `UPLOAD_SECRET` (cadena larga aleatoria)
6. Deploy → anotar URL: `https://eiel-adjuntos.<subdominio>.workers.dev`

### CLI
```bash
cd workers/adjuntos
npm install
npx wrangler r2 bucket create eiel-adjuntos
npx wrangler secret put UPLOAD_SECRET
npx wrangler deploy
```

Comprobar:

```bash
curl -sL "https://eiel-adjuntos.…/workers.dev?action=ping"
```

Debe devolver `"has_bucket":true,"has_secret":true`.

---

## 2. Apps Script Adjuntos

Pegar `appscript/adjuntos.gs` (incluye `action=import_url`) → **Nueva versión**.

---

## 3. Activar en el portal

Opción A (prueba rápida, sin regenerar HTML): en la consola del navegador, logueado:

```js
localStorage.setItem("eiel_adjuntos_worker", "https://eiel-adjuntos.<subdominio>.workers.dev");
```

**Importante:** incluye `https://`. Sin esquema, el navegador lo trata como ruta
de GitHub Pages (`…/eiel/eiel-adjuntos…`) y falla con 405.

Recargar el formulario. Las subidas usarán el Worker.

Opción B (permanente): en `templates/base.html.j2` / `EIEL_CONFIG`:

```js
urlAdjuntosWorker: "https://eiel-adjuntos.<subdominio>.workers.dev",
```

y regenerar `docs/`, o rellenar ese campo en los HTML.

Para volver al modo antiguo:

```js
localStorage.removeItem("eiel_adjuntos_worker");
```

---

## 4. Fiabilidad

- Tokens firmados (30 min) para PUT/GET
- Límite 35 MB (igual que antes)
- **Ficheros ≥ 5 MB** van por Apps Script directo (base64): `UrlFetch` de
  Apps Script no importa bien PDF grandes desde R2 y los reintentos
  hacían el envío *más lento* que sin Worker
- Ficheros pequeños: PUT a R2 + `import_url` (con reintento)
- Si falla el import, fallback a subida clásica base64
- Prefijos R2: `prod/…` y `pruebas/…`

### Desactivar Worker (volver al modo Apps Script puro)

```js
localStorage.removeItem("eiel_adjuntos_worker");
location.reload();
```

## 5. Limpieza R2

Los objetos en R2 son puente. Podéis borrar antiguos periódicamente
(lifecycle del bucket a 7–30 días) cuando ya estén en Drive.
