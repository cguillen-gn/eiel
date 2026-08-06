# Comprobar que el /exec tiene el código de pestañas `_pruebas`

No hace falta F12. Tras pegar el código y publicar **Nueva versión**:

## 1. Abre estas URLs en el navegador (las del portal actual)

**Logger**  
https://script.google.com/macros/s/AKfycbz3nkEhVupMMHjloz_7KGywmPFP1XTsT_Ym-hJpyPCxGO7mIyWD63ksegbWwe0emyIE4A/exec?action=ping

**PDF**  
https://script.google.com/macros/s/AKfycbzNT_oTUwnRDTcexmeubXr6YOnlR0B2cPZEwcAPt1r3xjnW-FsvaRRQOS9egH_3i1PA/exec?action=ping

**Adjuntos**  
https://script.google.com/macros/s/AKfycbz9ZAEeNm8tQLJ4VETetkIDLDjD1Vy27DVywTxDZDFbNEtuJocwpnpP6Z7S_46hpf3-Jw/exec?action=ping

## 2. Qué debes ver

Texto JSON con algo como:

```json
"eiel_build": "logs-split-20260806",
"logs_split": true
```

- Si **no** aparece `logs-split-20260806` → esa URL no tiene el código nuevo
  (proyectos distintos, o no se publicó Nueva versión de *esa* implementación).
- Si la página da error / HTML raro → runtime Rhino o despliegue mal.

## 3. Cuadrar proyecto ↔ URL

En Apps Script → **Implementar → Administrar implementaciones** → la URL de la
aplicación web debe ser **exactamente** la del portal (sin `?action=ping`).
Si no coincide, estás editando otro proyecto.
