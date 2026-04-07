/**
 * EIEL - FORM-HANDLER.JS
 * Lógica centralizada para la gestión de formularios y envíos a Google Apps Script.
 */

// --- ESTADO GLOBAL ---
let archivos = []; 
let colaAdjuntosReq = {}; // Almacena archivos de los requerimientos { index: File }

// --- 1. UTILIDADES DE INTERFAZ (UI) ---
const UI = {
    progressOverlay: document.getElementById('progressOverlay'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    btnEnviar: document.getElementById('btnEnviar'),
    checkConformidad: document.getElementById('checkConformidad'),

    showProgress(msg, percent) {
        if (this.progressOverlay) {
            this.progressOverlay.classList.remove('hidden');
            if (msg) this.progressText.textContent = msg;
            if (percent !== undefined) this.progressBar.style.width = percent + '%';
        }
    },

    hideProgress() {
        if (this.progressOverlay) this.progressOverlay.classList.add('hidden');
    },

    freeze(state) {
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = state;
        });
    }
};

// --- 2. GESTIÓN DE ARCHIVOS (SUBIDA A GOOGLE DRIVE) ---

/**
 * Maneja la selección de archivos en las filas de requerimientos (macros)
 */
window.handleFileSelectReq = function(event, reqId) {
    const file = event.target.files[0];
    if (!file) return;

    // Validación de tamaño (10MB)
    if (file.size > 10 * 1024 * 1024) {
        Swal.fire("Archivo demasiado grande", "El límite es de 10MB por archivo.", "error");
        event.target.value = "";
        return;
    }

    colaAdjuntosReq[reqId] = file;
    
    // Actualizar la lista visual (id generado por la macro)
    const listContainer = document.getElementById(`file_list_req_${reqId}`);
    if (listContainer) {
        listContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; margin-top: 5px; color: var(--success); font-weight: 600;">
                <i data-lucide="file-check"></i>
                <span>${file.name}</span>
                <button type="button" onclick="removeFileReq(${reqId})" style="color: var(--danger); border: none; background: none; cursor: pointer; font-weight: bold;">[Quitar]</button>
            </div>
        `;
        lucide.createIcons();
    }
};

window.removeFileReq = function(reqId) {
    delete colaAdjuntosReq[reqId];
    const listContainer = document.getElementById(`file_list_req_${reqId}`);
    if (listContainer) listContainer.innerHTML = "";
    const input = document.getElementById(`file_req_${reqId}`);
    if (input) input.value = "";
};

/**
 * Función núcleo para subir CUALQUIER archivo al Apps Script de Drive
 */
async function uploadToDrive(file, seccion, idEnvio) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result.split(",")[1];
            try {
                const response = await fetch(window.EIEL_CONFIG.urlAdjuntos, {
                    method: "POST",
                    body: JSON.stringify({
                        municipio: window.EIEL_CONFIG.muniCode,
                        tipo: window.EIEL_CONFIG.tipoFormulario,
                        seccion: seccion,
                        id_envio: idEnvio,
                        filename: file.name,
                        mimeType: file.type,
                        base64: base64Data
                    })
                });
                const res = await response.json();
                resolve(res.status === "success" ? file.name : null);
            } catch (err) {
                console.error("Error en uploadToDrive:", err);
                resolve(null); 
            }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

// --- 3. PROCESO DE ENVÍO FINAL ---

/**
 * Orquestador del envío. 
 * @param {Function} getSpecificDataCallback - Función que devuelve el JSON con los datos únicos de cada formulario.
 */
async function processSubmit(getSpecificDataCallback) {
    if (!UI.checkConformidad || !UI.checkConformidad.checked) return;

    const result = await Swal.fire({
        title: '¿Enviar información?',
        text: "Se registrará la respuesta en el sistema y se generará el PDF correspondiente.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--primary)',
        confirmButtonText: 'Sí, enviar',
        cancelButtonText: 'Revisar'
    });

    if (!result.isConfirmed) return;

    try {
        UI.freeze(true);
        UI.showProgress("Iniciando envío y preparando archivos...", 10);

        const idEnvio = "ENV_" + Date.now();
        let nombresAdjuntos = [];

        // 1. Subir archivos de requerimientos (si existen)
        const entries = Object.entries(colaAdjuntosReq);
        for (let i = 0; i < entries.length; i++) {
            const [reqId, file] = entries[i];
            UI.showProgress(`Subiendo adjunto de requerimiento ${i + 1}/${entries.length}...`, 20 + (i * 10));
            const uploadedName = await uploadToDrive(file, `REQUERIMIENTO_${parseInt(reqId) + 1}`, idEnvio);
            if (uploadedName) nombresAdjuntos.push(uploadedName);
        }

        // 2. Recoger respuestas de requerimientos (macro)
        let respuestasReq = [];
        document.querySelectorAll(".aviso-item").forEach((item, index) => {
            const txt = item.querySelector(".req-respuesta")?.value || "";
            if (txt.trim() !== "") {
                respuestasReq.push({
                    id: index + 1,
                    descripcion: item.querySelector(".aviso-texto")?.textContent || "N/A",
                    respuesta: txt
                });
            }
        });

        UI.showProgress("Generando acta PDF y notificando por email...", 80);

        // 3. Construir Payload base
        const payload = {
            id_envio: idEnvio,
            tipo_formulario: window.EIEL_CONFIG.tipoFormulario,
            municipio_codigo: window.EIEL_CONFIG.muniCode,
            municipio_nombre: window.EIEL_CONFIG.muniName,
            timestamp_envio: new Date().toISOString(),
            nombre_contacto: localStorage.getItem("eiel_user_name") || "N/A",
            email_contacto: localStorage.getItem("eiel_user_email") || "N/A",
            departamento_contacto: localStorage.getItem("eiel_user_dept") || "N/A",
            observaciones: document.getElementById("observaciones")?.value || "",
            archivos_adjuntos: nombresAdjuntos,
            respuestas_requerimientos_json: JSON.stringify(respuestasReq)
        };

        // 4. Integrar datos específicos del formulario (Agua, Alumbrado, etc.)
        const specificData = getSpecificDataCallback();
        Object.assign(payload, specificData);

        // 5. Envío al Apps Script de generación de PDF
        await fetch(window.EIEL_CONFIG.urlGenerarPdf, {
            method: "POST", 
            mode: "no-cors",
            body: JSON.stringify(payload)
        });

        UI.showProgress("¡Completado con éxito!", 100);
        
        await Swal.fire({
            title: "¡Enviado!",
            text: "La información se ha procesado correctamente. Recibirá un email de confirmación.",
            icon: "success"
        });

        // Limpiar y volver
        window.location.href = "index.html";

    } catch (error) {
        console.error("Error crítico en el envío:", error);
        Swal.fire("Error", "No se pudo completar el envío: " + error.message, "error");
        UI.freeze(false);
        UI.hideProgress();
    }
}

// --- 4. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Activar iconos de Lucide
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Activar el botón de enviar solo cuando el check esté marcado
    if (UI.checkConformidad && UI.btnEnviar) {
        UI.checkConformidad.addEventListener('change', (e) => {
            UI.btnEnviar.disabled = !e.target.checked;
        });
    }
});