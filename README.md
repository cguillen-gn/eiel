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
    git push origin main
    ```

---

## 🔐 Seguridad y Robustez

* **Variables de Entorno:** El archivo `.env` está excluido vía `.gitignore`. Contiene los accesos a la base de datos y los endpoints privados de Apps Script.
* **Congelado de Formulario (Freeze):** Durante el envío de datos, el formulario se bloquea (`toggleFormFreeze`) para evitar que el usuario altere la información mientras se procesa la subida de archivos o el PDF.
* **Integridad Automática:** Al limpiar la carpeta `docs/` en cada ejecución, se garantiza que la web pública siempre refleje exactamente lo que indica el archivo de datos actual.

---

## ❓ Solución de Problemas

* **¿No aparecen los adjuntos en el log de Obras?** Verifica que el `payload` en el JS de Obras incluya la clave `archivos_adjuntos` recolectando todos los nombres de archivos.
* **¿Error de conexión a la BD?** Comprueba que los parámetros en el `.env` (Host, Port, User, Pass) sean correctos para el servidor PostgreSQL.
* **¿La hoja de logs no se crea sola?** Revisa que el ID del Spreadsheet en el Google Apps Script sea el correcto y que el script tenga permisos de edición.