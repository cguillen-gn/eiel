<<<<<<< HEAD
# 📋 Portal de Encuestas EIEL - Diputación de Alicante

Sistema web para la gestión y actualización de la **Encuesta de Infraestructura y Equipamientos Locales (EIEL)**. Permite a los técnicos municipales validar datos de servicios (agua, residuos, obras, etc.) y adjuntar documentación técnica de forma centralizada.

## 🚀 Funcionamiento del Sistema

El proyecto utiliza una arquitectura de **Generador de Sitios Estáticos (SSG)** con un backend desacoplado:

1.  **Generación (Python):** El script `gen_forms.py` consulta una base de datos PostgreSQL y procesa plantillas Jinja2 para crear archivos HTML individuales por cada municipio.
2.  **Frontend (HTML/JS):** La web resultante es una aplicación estática alojada en **GitHub Pages**. Utiliza `localStorage` para persistir los datos del técnico y asegurar que la sesión se mantenga activa entre diferentes formularios.
3.  **Backend (Google Apps Script):** Las acciones de subida de archivos a Drive, generación de justificantes PDF y registro de logs se delegan en Web Apps de Google para garantizar la escalabilidad y seguridad.

---

## 📂 Estructura de Archivos

El proyecto separa estrictamente los archivos de **Desarrollo** (donde se trabaja) de los de **Producción** (lo que ve el usuario).

### 🛠️ Zona de Desarrollo (Raíz) - *Modificar aquí*
* `gen_forms.py`: Script principal que construye la web consultando la base de datos.
* `templates/`: Plantillas maestras (`.html.j2`). Aquí se cambia el diseño global de los formularios.
* `data/municipios.tsv`: Listado fuente de municipios y códigos INE que el script procesará.
* `css/style.css` y `assets/`: Archivos originales de estilo e imagen que el script copia a la web final.
* `js/upload.js`: Código fuente de la lógica de subida a Drive.
* `.env`: **Archivo privado** (No subir a GitHub) con credenciales de base de datos y URLs de Google.
* `generate.bat`: Script de automatización que limpia la web antigua y genera la nueva.

### 🌐 Zona de Producción (`docs/`) - *No tocar manualmente*
* Carpeta utilizada por GitHub Pages para publicar la web.
* **IMPORTANTE:** No editar nada aquí manualmente. El proceso de generación borra y recrea estos archivos automáticamente para garantizar la integridad de la web pública.

---

## 🔧 Guía de Mantenimiento

Utiliza esta tabla como referencia rápida para actualizar el portal:

| Objetivo | Archivo a modificar | Acción necesaria |
| :--- | :--- | :--- |
| **Cambiar una URL de Google** | El archivo `.env`. | Ejecutar `generate.bat`. |
| **Añadir una pregunta/campo** | La plantilla en `templates/`. | Ejecutar `generate.bat`. |
| **Actualizar logos o iconos** | La carpeta `assets/` de la raíz. | Ejecutar `generate.bat`. |
| **Modificar la consulta SQL** | Funciones `obtener_xxx` en `gen_forms.py`. | Ejecutar `generate.bat`. |
| **Cambiar colores o fuentes** | El archivo `css/style.css` de la raíz. | Ejecutar `generate.bat`. |
| **Añadir/Quitar un municipio** | El archivo `data/municipios.tsv`. | Ejecutar `generate.bat`. |

---

## 📦 Proceso de Actualización (Despliegue)

Para subir cambios a la web, sigue siempre este orden:

1.  Modifica los archivos originales en la raíz o en la carpeta `templates/`.
2.  Ejecuta el archivo **`generate.bat`**. Este automatismo realizará dos acciones:
    * **Limpieza:** Borrará todos los archivos `.html` antiguos en `docs/` para evitar versiones obsoletas.
    * **Generación:** Ejecutará `gen_forms.py` para crear la nueva versión de la web.
3.  Sube los cambios a GitHub:
    ```bash
    git add .
    git commit -m "Descripción del cambio realizado"
=======
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
>>>>>>> 56d576952ea9e89e200d5da64c4da82d006ee29f
    git push origin main
    ```

---

<<<<<<< HEAD
## 🔐 Seguridad y Robustez

* **Variables de Entorno:** El archivo `.env` está excluido vía `.gitignore`. Contiene los accesos a la base de datos y los endpoints privados de Apps Script.
* **Congelado de Formulario (Freeze):** Durante el envío de datos, el formulario se bloquea (`toggleFormFreeze`) para evitar que el usuario altere la información mientras se procesa la subida de archivos o el PDF.
* **Integridad Automática:** Al limpiar la carpeta `docs/` en cada ejecución, se garantiza que la web pública siempre refleje exactamente lo que indica el archivo de datos actual.

---

## ❓ Solución de Problemas

* **¿No aparecen los adjuntos en el log de Obras?** Verifica que el `payload` en el JS de Obras incluya la clave `archivos_adjuntos` recolectando todos los nombres de archivos.
* **¿Error de conexión a la BD?** Comprueba que los parámetros en el `.env` (Host, Port, User, Pass) sean correctos para el servidor PostgreSQL.
* **¿La hoja de logs no se crea sola?** Revisa que el ID del Spreadsheet en el Google Apps Script sea el correcto y que el script tenga permisos de edición.
=======
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




>>>>>>> 56d576952ea9e89e200d5da64c4da82d006ee29f
