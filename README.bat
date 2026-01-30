<h1>Título muy grande</h1>
<h2>Título grande</h2>
<h3>Título mediano</h3>
<p>Texto normal</p>


# 🏛️ Portal de Encuestas EIEL — Diputación de Alicante

> **Sistema de gestión y actualización masiva de la Encuesta de Infraestructura y Equipamientos Locales.**

![GitHub Pages](https://img.shields.io/badge/Deployment-GitHub_Pages-blue?style=for-the-badge&logo=github)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Google Apps Script](https://img.shields.io/badge/Backend-Google_Apps_Script-4285F4?style=for-the-badge&logo=google)

---

## 🚀 Visión General del Proyecto

Este ecosistema permite a los técnicos municipales de la provincia de Alicante validar y actualizar datos críticos de servicios e infraestructuras. El proyecto destaca por su arquitectura híbrida: **Frontend Estático** para máxima velocidad y **Backend Serverless** (Google Apps Script) para la gestión segura de documentos y datos.

### 💡 Flujo de Datos
* **Ingesta:** El script `gen_forms.py` extrae datos actualizados de **PostgreSQL** mediante consultas SQL específicas para servicios como agua, depósitos, cementerios y obras.
* **Procesado:** Jinja2 renderiza plantillas dinámicas (`.html.j2`) inyectando configuraciones por municipio y URLs de backend cargadas desde el archivo `.env`.
* **Despliegue:** La carpeta `docs/` se sirve vía **GitHub Pages**, ofreciendo una interfaz rápida y sin servidores intermedios.
* **Acción:** Los envíos y adjuntos se canalizan a **Google Drive/Sheets** mediante peticiones POST a los endpoints de Apps Script configurados en las variables de entorno.

---

## 📂 Arquitectura del Repositorio (Mapa del Proyecto)

La separación entre **Código Fuente** (Raíz) y **Distribución** (`docs/`) garantiza que los datos sensibles y el motor de generación nunca se filtren a la web pública.

```text
📦 raiz-del-proyecto
 ┣ 📂 assets             # 🖼️ Recursos visuales originales (logos, favicon.ico)
 ┣ 📂 css                # 🎨 Estilos originales (style.css fuente)
 ┣ 📂 data               # 📊 Base de datos local (municipios.tsv)
 ┣ 📂 js                 # ⚙️ Lógica de subida (upload.js fuente)
 ┣ 📂 templates          # 🧱 Plantillas maestras Jinja2 (.html.j2)
 ┣ 📂 docs               # 🌐 DISTRIBUCIÓN (Lo que ve el usuario final)
 ┃ ┣ 📂 assets           # Copia procesada de recursos visuales
 ┃ ┣ 📂 css              # Estilos copiados para la web final
 ┃ ┣ 📂 img              # Logos de municipios y recursos multimedia
 ┃ ┗ 📜 *.html           # Formularios finales generados por municipio
 ┣ 📜 .env               # 🔒 SEGURIDAD (Credenciales de DB y URLs de Google)
 ┣ 📜 .env.example       # 📝 Guía de configuración para nuevos técnicos
 ┣ 📜 .gitignore         # Configuración para ignorar archivos sensibles (.env)
 ┣ 📜 gen_forms.py       # 🧠 El "Cerebro" generador basado en Python
 ┣ 📜 generate.bat       # ⚡ Automatismo de limpieza y construcción (Build)
 ┗ 📜 README.md          # 📖 Documentación técnica (este archivo)
