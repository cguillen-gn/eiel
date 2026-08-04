# Despliegue Adjuntos (imprescindible)

El portal de Pages **no actualiza** Google Apps Script. Tras cada cambio en
`appscript/adjuntos.gs` hay que pegarlo a mano.

## Pasos

1. Abrir el proyecto Apps Script de **Adjuntos** (el de `URL_ADJUNTOS`).
2. Sustituir el contenido de `Código.gs` por el de `appscript/adjuntos.gs` del repo (completo).
3. **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar.**
   - No crear una implementación nueva (cambiaría la URL).
4. Comprobar: Ejecutar como *Yo*; Quién tiene acceso: *Cualquiera*.
5. Hard refresh del portal.

## Cómo saber si está bien

En la consola del navegador, tras un fallo opaco, **no** debe aparecer:

> El Web App de Adjuntos no reconoce action=check

Si aparece, la versión desplegada es antigua.

Prueba rápida (desde terminal):

```bash
curl -s -X POST "$URL_ADJUNTOS" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"check","filename":"x.jpg","municipio":"005","seccion":"GENERAL","id_envio":"ENVIO_TEST"}'
```

Respuesta esperada: `{"status":"missing",...}` (o `success` si existe).  
Si dice «Faltan datos necesarios…», el `check` **no** está desplegado.
