# 🏛️ Portal de Formularios EIEL para ayuntamientos

> **Geonet Territorial | Diputación de Alicante**

![GitHub Pages](https://img.shields.io/badge/Deployment-GitHub_Pages-blue?style=for-the-badge&logo=github)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Google Apps Script](https://img.shields.io/badge/Backend-Google_Apps_Script-4285F4?style=for-the-badge&logo=google)

---

## 🚀 Visión General del Proyecto

Este ecosistema permite a los técnicos municipales de la provincia de Alicante validar y actualizar datos críticos de servicios e infraestructuras. El proyecto destaca por su arquitectura híbrida: **Frontend Estático** para máxima velocidad y **Backend Serverless** (Google Apps Script) para la gestión segura de documentos y datos.

### 💡 Flujo de Datos
* **Ingesta:** El script `gen_forms.py` extrae datos actualizados de **PostgreSQL** mediante consultas SQL específicas para servicios como agua, saneamiento, alubrado, viario, residuos, cementerios y obras.
* **Procesado:** Jinja2 renderiza plantillas dinámicas (`.html.j2`) inyectando configuraciones por municipio y URLs de backend cargadas desde el archivo `.env`.
* **Despliegue:** La carpeta `docs/` se sirve vía **GitHub Pages**, ofreciendo una interfaz rápida y sin servidores intermedios.
* **Acción:** Los envíos y adjuntos se canalizan a **Google Drive/Sheets** mediante peticiones POST a los endpoints de Apps Script configurados en las variables de entorno.

---

## 📂 Arquitectura del Repositorio (Mapa del Proyecto)

La separación entre **Código Fuente** (Raíz) y **Distribución** (`docs/`) garantiza que los datos sensibles y el motor de generación nunca se filtren a la web pública.


```text
📦 raiz-del-proyecto
 ┣ 📂 assets             # Recursos visuales originales
 ┣ 📂 css                # Estilos originales (style.css fuente)
 ┣ 📂 data               # Base de datos local (municipios.tsv)
 ┣ 📂 js                 # Lógica de subida (upload.js fuente)
 ┣ 📂 templates          # Plantillas maestras Jinja2 (.html.j2)
 ┣ 📂 docs               # DISTRIBUCIÓN (Lo que ve el usuario final)
 ┃ ┣ 📂 assets           # Copia procesada de recursos visuales para la web final
 ┃ ┣ 📂 css              # Copia de estilos para la web final
 ┃ ┣ 📂 img              # Logos y otros recursos
 ┃ ┗ 📜 *.html           # Formularios finales generados por municipio
 ┣ 📜 .env               # SEGURIDAD (Credenciales de DB y URLs de Google). No se sube a github.
 ┣ 📜 .env.example       # Archivo .env de ejemplo para ver estructura
 ┣ 📜 .gitignore         # Configuración para ignorar archivos sensibles (.env)
 ┣ 📜 gen_forms.py       # El "Cerebro" generador basado en Python
 ┣ 📜 generate.bat       # Automatismo que ejecuta gen_forms.py tras limpiar los archivos existentes (Build)
 ┗ 📜 README.md          # Documentación técnica (este archivo)
```
---


## 🔧 Panel de Mantenimiento

Para realizar cambios, **ignora la carpeta `docs/`**. Los cambios se realizan siempre en los archivos de origen de la raíz para que el script de generación los propague correctamente:

| Tarea | Archivo Objetivo | Acción Sugerida |
| :--- | :--- | :--- |
| **Actualizar URLs/Claves** | `.env` | Editar variables de entorno y ejecutar `generate.bat`. |
| **Modificar Estructura Web** | `templates/*.j2` | Editar las plantillas Jinja2 y ejecutar `generate.bat`. |
| **Gestionar Municipios** | `data/municipios.tsv` | Actualizar el listado en el TSV y ejecutar `generate.bat`. |
| **Cambiar Colores/Estilo** | `css/style.css` | Editar el CSS original y ejecutar `generate.bat`. |
| **Ajustar Consultas SQL** | `gen_forms.py` | Modificar las funciones `obtener_xxx` y ejecutar `generate.bat`. |

---

## 📦 Pipeline de Despliegue (Workflow)

El proceso de actualización es atómico para garantizar que la web pública siempre esté sincronizada y no queden archivos huérfanos de municipios eliminados:

1.  **Edición:** Realiza los cambios necesarios en las plantillas Jinja2, el archivo de estilos CSS o el listado de municipios en el archivo TSV.
2.  **Construcción (Build):** Ejecuta el archivo `generate.bat`. Este script automatiza la limpieza de los archivos HTML antiguos en la carpeta `docs/` y lanza el script `gen_forms.py` para generar la nueva versión procesada.
3.  **Sincronización:** Una vez verificados los cambios localmente, sube la actualización al repositorio.
    ```bash
    git add .
    git commit -m "feat: actualización de formularios para la fase actual"
    git push origin main
    ```

---

## 🔐 Protocolos de Seguridad y Robustez

El sistema ha sido diseñado priorizando la integridad de los datos y la protección de las credenciales de acceso:

* **Zero Leak Policy:** El archivo `.env` está estrictamente excluido mediante `.gitignore` para evitar la exposición de credenciales de PostgreSQL y endpoints privados de Google Apps Script.
* **Integridad en el Envío:** Los formularios implementan la función `toggleFormFreeze(true)` durante el envío de datos. Esto bloquea la interfaz de usuario para evitar alteraciones accidentales mientras se procesa la subida a Drive y la generación del justificante PDF.
* **Sesión Segura y Privacidad:** Al cerrar sesión mediante la función `logout()`, se eliminan los datos del técnico (nombre y email) almacenados en el `localStorage` del navegador para proteger la identidad del usuario.
* **Consistencia de Producción:** La limpieza automática de la carpeta `docs/` en cada ejecución de `generate.bat` garantiza que no existan archivos "fantasma" y que la web pública refleje con exactitud el estado actual de la base de datos.

---

## ❓ Troubleshooting (Solución de Problemas)

A continuación se detallan los errores más comunes y cómo resolverlos sistemáticamente:

### 🐍 Errores de Generación (Python/DB)
* **¿Error de conexión a la Base de Datos?**:
    * Verifica que los parámetros `DB_HOST`, `DB_USER` y `DB_PASSWORD` en tu archivo `.env` local sean correctos.
    * Asegúrate de que el servidor PostgreSQL esté aceptando conexiones en el puerto configurado (predeterminado: 5432).
* **¿El script de Python no encuentra las plantillas?**:
    * Comprueba que todos los archivos `.html.j2` estén dentro de la carpeta `templates/` con los nombres exactos.
* **¿Faltan municipios en el Index?**:
    * Revisa el archivo `data/municipios.tsv`. Si hay filas mal formateadas o sin código INE, el script las omitirá.

### 🌐 Errores en la Web (GitHub Pages/Assets)
* **¿Los estilos CSS o imágenes no se ven?**:
    * Asegúrate de haber ejecutado `generate.bat`. Este script es el responsable de copiar físicamente las carpetas `css/` y `assets/` a la carpeta `docs/` para su publicación.
    * Verifica que las rutas en los HTML sean relativas, ya que GitHub Pages puede ser sensible a las mayúsculas y minúsculas en los nombres de archivo.
* **¿Aparecen nombres de municipios mal escritos?**:
    * El script aplica automáticamente la función `formatear_nombre_ui`. Si un nombre nuevo no se formatea bien, revisa la expresión regular del script que gestiona los artículos finales (ej: "Alicante (L')").

### ☁️ Errores de Envío (Google Apps Script)
* **¿Error 403 o 404 al enviar el formulario?**:
    * Comprueba que las URLs en el `.env` correspondan a la **versión desplegada** (exec) del Apps Script y no al editor.
    * Asegúrate de que los scripts de Google tengan los permisos configurados para ejecutarse como "Yo (el propietario)" y sean accesibles por "Cualquiera".
* **¿Los archivos adjuntos no llegan a Drive?**:
    * Revisa el log de la Web App en Google para verificar si hay errores de cuota de almacenamiento o permisos de carpeta.

---




