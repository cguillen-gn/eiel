# ??? Portal de Formularios EIEL para ayuntamientos

> **Geonet Territorial | Diputaci車n de Alicante**

![GitHub Pages](https://img.shields.io/badge/Deployment-GitHub_Pages-blue?style=for-the-badge&logo=github)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Google Apps Script](https://img.shields.io/badge/Backend-Google_Apps_Script-4285F4?style=for-the-badge&logo=google)

---

## ?? Visi車n General del Proyecto

Este ecosistema permite a los t谷cnicos municipales de la provincia de Alicante validar y actualizar datos cr赤ticos de servicios e infraestructuras. El proyecto destaca por su arquitectura h赤brida: **Frontend Est芍tico** para m芍xima velocidad y **Backend Serverless** (Google Apps Script) para la gesti車n segura de documentos y datos.

### ?? Flujo de Datos
* **Ingesta:** El script `gen_forms.py` extrae datos actualizados de **PostgreSQL** mediante consultas SQL espec赤ficas para servicios como agua, saneamiento, alubrado, viario, residuos, cementerios y obras.
* **Procesado:** Jinja2 renderiza plantillas din芍micas (`.html.j2`) inyectando configuraciones por municipio y URLs de backend cargadas desde el archivo `.env`.
* **Despliegue:** La carpeta `docs/` se sirve v赤a **GitHub Pages**, ofreciendo una interfaz r芍pida y sin servidores intermedios.
* **Acci車n:** Los env赤os y adjuntos se canalizan a **Google Drive/Sheets** mediante peticiones POST a los endpoints de Apps Script configurados en las variables de entorno.

---

## ?? Arquitectura del Repositorio (Mapa del Proyecto)

La separaci車n entre **C車digo Fuente** (Ra赤z) y **Distribuci車n** (`docs/`) garantiza que los datos sensibles y el motor de generaci車n nunca se filtren a la web p迆blica.


```text
?? raiz-del-proyecto
 怪 ?? assets             # Recursos visuales originales
 怪 ?? css                # Estilos originales (style.css fuente)
 怪 ?? data               # Base de datos local (municipios.tsv)
 怪 ?? js                 # L車gica de subida (upload.js fuente)
 怪 ?? templates          # Plantillas maestras Jinja2 (.html.j2)
 怪 ?? docs               # DISTRIBUCI車N (Lo que ve el usuario final)
 岱 怪 ?? assets           # Copia procesada de recursos visuales para la web final
 岱 怪 ?? css              # Copia de estilos para la web final
 岱 怪 ?? img              # Logos y otros recursos
 岱 彿 ?? *.html           # Formularios finales generados por municipio
 怪 ?? .env               # SEGURIDAD (Credenciales de DB y URLs de Google). No se sube a github.
 怪 ?? .env.example       # Archivo .env de ejemplo para ver estructura
 怪 ?? .gitignore         # Configuraci車n para ignorar archivos sensibles (.env)
 怪 ?? gen_forms.py       # El "Cerebro" generador basado en Python
 怪 ?? generate.bat       # Automatismo que ejecuta gen_forms.py tras limpiar los archivos existentes (Build)
 彿 ?? README.md          # Documentaci車n t谷cnica (este archivo)
```
---


## ?? Panel de Mantenimiento

Para realizar cambios, **ignora la carpeta `docs/`**. Los cambios se realizan siempre en los archivos de origen de la ra赤z para que el script de generaci車n los propague correctamente:

| Tarea | Archivo Objetivo | Acci車n Sugerida |
| :--- | :--- | :--- |
| **Actualizar URLs/Claves** | `.env` | Editar variables de entorno y ejecutar `generate.bat`. |
| **Modificar Estructura Web** | `templates/*.j2` | Editar las plantillas Jinja2 y ejecutar `generate.bat`. |
| **Gestionar Municipios** | `data/municipios.tsv` | Actualizar el listado en el TSV y ejecutar `generate.bat`. |
| **Cambiar Colores/Estilo** | `css/style.css` | Editar el CSS original y ejecutar `generate.bat`. |
| **Ajustar Consultas SQL** | `gen_forms.py` | Modificar las funciones `obtener_xxx` y ejecutar `generate.bat`. |

---

## ?? Pipeline de Despliegue (Workflow)

El proceso de actualizaci車n es at車mico para garantizar que la web p迆blica siempre est谷 sincronizada y no queden archivos hu谷rfanos de municipios eliminados:

1.  **Edici車n:** Realiza los cambios necesarios en las plantillas Jinja2, el archivo de estilos CSS o el listado de municipios en el archivo TSV.
2.  **Construcci車n (Build):** Ejecuta el archivo `generate.bat`. Este script automatiza la limpieza de los archivos HTML antiguos en la carpeta `docs/` y lanza el script `gen_forms.py` para generar la nueva versi車n procesada.
3.  **Sincronizaci車n:** Una vez verificados los cambios localmente, sube la actualizaci車n al repositorio.
    ```bash
    git add .
    git commit -m "feat: actualizaci車n de formularios para la fase actual"
    git push origin main
    ```

---

## ?? Protocolos de Seguridad y Robustez

El sistema ha sido dise?ado priorizando la integridad de los datos y la protecci車n de las credenciales de acceso:

* **Zero Leak Policy:** El archivo `.env` est芍 estrictamente excluido mediante `.gitignore` para evitar la exposici車n de credenciales de PostgreSQL y endpoints privados de Google Apps Script.
* **Integridad en el Env赤o:** Los formularios implementan la funci車n `toggleFormFreeze(true)` durante el env赤o de datos. Esto bloquea la interfaz de usuario para evitar alteraciones accidentales mientras se procesa la subida a Drive y la generaci車n del justificante PDF.
* **Sesi車n Segura y Privacidad:** Al cerrar sesi車n mediante la funci車n `logout()`, se eliminan los datos del t谷cnico (nombre y email) almacenados en el `localStorage` del navegador para proteger la identidad del usuario.
* **Consistencia de Producci車n:** La limpieza autom芍tica de la carpeta `docs/` en cada ejecuci車n de `generate.bat` garantiza que no existan archivos "fantasma" y que la web p迆blica refleje con exactitud el estado actual de la base de datos.

---

## ? Troubleshooting (Soluci車n de Problemas)

A continuaci車n se detallan los errores m芍s comunes y c車mo resolverlos sistem芍ticamente:

### ?? Errores de Generaci車n (Python/DB)
* **?Error de conexi車n a la Base de Datos?**:
    * Verifica que los par芍metros `DB_HOST`, `DB_USER` y `DB_PASSWORD` en tu archivo `.env` local sean correctos.
    * Aseg迆rate de que el servidor PostgreSQL est谷 aceptando conexiones en el puerto configurado (predeterminado: 5432).
* **?El script de Python no encuentra las plantillas?**:
    * Comprueba que todos los archivos `.html.j2` est谷n dentro de la carpeta `templates/` con los nombres exactos.
* **?Faltan municipios en el Index?**:
    * Revisa el archivo `data/municipios.tsv`. Si hay filas mal formateadas o sin c車digo INE, el script las omitir芍.

### ?? Errores en la Web (GitHub Pages/Assets)
* **?Los estilos CSS o im芍genes no se ven?**:
    * Aseg迆rate de haber ejecutado `generate.bat`. Este script es el responsable de copiar f赤sicamente las carpetas `css/` y `assets/` a la carpeta `docs/` para su publicaci車n.
    * Verifica que las rutas en los HTML sean relativas, ya que GitHub Pages puede ser sensible a las may迆sculas y min迆sculas en los nombres de archivo.
* **?Aparecen nombres de municipios mal escritos?**:
    * El script aplica autom芍ticamente la funci車n `formatear_nombre_ui`. Si un nombre nuevo no se formatea bien, revisa la expresi車n regular del script que gestiona los art赤culos finales (ej: "Alicante (L')").

### ?? Errores de Env赤o (Google Apps Script)
* **?Error 403 o 404 al enviar el formulario?**:
    * Comprueba que las URLs en el `.env` correspondan a la **versi車n desplegada** (exec) del Apps Script y no al editor.
    * Aseg迆rate de que los scripts de Google tengan los permisos configurados para ejecutarse como "Yo (el propietario)" y sean accesibles por "Cualquiera".
* **?Los archivos adjuntos no llegan a Drive?**:
    * Revisa el log de la Web App en Google para verificar si hay errores de cuota de almacenamiento o permisos de carpeta.

---



