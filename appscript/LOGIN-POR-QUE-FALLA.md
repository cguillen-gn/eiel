# Por qué falla el login (Apps Script)

## Qué ves

- Mensaje: **«Error de conexión con el servidor.»** (o el aviso de cold start).
- Consola: `GET …/macros/echo?… 404` y
  `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
- A menudo ~15–25 s y falla; a veces ~1–3 s y va bien.

## Qué NO es

- No es municipio / contraseña mal puestos (eso da «Código de acceso incorrecto»).
- No es un bug del HTML del portal ni de `login.gs` (lógica de credenciales).
- No se arregla redeployando otra vez el Web App (suele empeorarlo).

## Qué SÍ es

1. El navegador hace `POST` a `script.google.com/macros/s/…/exec`.
2. Google responde `302` a `script.googleusercontent.com/macros/echo?…`.
3. En arranque en frío (o tras muchos redespliegues), ese `echo` a veces
   sirve una **página HTML 404** en lugar del JSON de `doPost`.
4. El front intenta parsear JSON → falla → «Error de conexión…».

Cuando el despliegue está **caliente**, la misma URL responde JSON en ~1 s
(probado desde servidor). Por eso parece “aleatorio”.

## Qué hacer

| Opción | Efecto |
|--------|--------|
| Pulsar Entrar otra vez a los 2–3 s | Suele ir (ya está caliente). No es producto aceptable. |
| **Cloudflare Worker** (`cloudflare/login-worker/`) | Login gratis y fiable a la primera. **Recomendado.** |
| Seguir en Apps Script | Seguirás viendo fallos intermitentes. |

Pasos del Worker: `cloudflare/login-worker/README.md`.

## Mientras tanto

- No crees un **nuevo** despliegue Web App (cambia la URL).
- Si pegas `login.gs`, usa **Nueva versión** de la app existente.
- El portal ya detecta respuesta HTML y lo dice en claro (no lo confunde con contraseña).
