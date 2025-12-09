/**
 * Servicio de Subida de Archivos para EIEL
 * Maneja la comunicación con Google Apps Script via iframe hack para evitar CORS.
 */
const UploadService = {
    
    // Configuración: URL del Apps Script (se leerá de una variable global window.EIEL_CONFIG)
    getUrl() {
        if (window.EIEL_CONFIG && window.EIEL_CONFIG.urlAdjuntos) {
            return window.EIEL_CONFIG.urlAdjuntos;
        }
        console.error("❌ No se encontró window.EIEL_CONFIG.urlAdjuntos");
        return "";
    },

    /**
     * Sube un único archivo
     * @param {File} file - Objeto File del input
     * @param {string} tipo - 'agua', 'residuos', 'cementerios', 'obra'
     * @param {string} muniCode - Código del municipio
     * @param {string|null} obraId - (Opcional) ID de la obra si tipo es 'obra'
     * @returns {Promise<boolean>} - True si éxito, False si error
     */
    uploadFile(file, tipo, muniCode, obraId = null) {
        return new Promise((resolve) => {
            console.log(`🚀 Iniciando subida: ${file.name} (${file.size} bytes)`);
            
            const reader = new FileReader();
            
            reader.onerror = () => {
                console.error("❌ Error leyendo archivo local");
                resolve(false);
            };

            reader.onload = () => {
                try {
                    const base64 = reader.result.split(',')[1];
                    this._sendToScript(file, base64, tipo, muniCode, obraId, resolve);
                } catch (e) {
                    console.error("❌ Error procesando Base64:", e);
                    resolve(false);
                }
            };
            
            reader.readAsDataURL(file);
        });
    },

    /**
     * Método privado que crea el iframe y el formulario
     */
    _sendToScript(file, base64, tipo, muniCode, obraId, resolve) {
        const iframeName = "upload_frame_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        
        // 1. Crear Iframe invisible
        const iframe = document.createElement("iframe");
        iframe.name = iframeName;
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        // 2. Crear Formulario
        const form = document.createElement("form");
        form.method = "POST";
        form.action = this.getUrl();
        form.target = iframeName;

        // 3. Añadir campos
        const fields = {
            tipo: tipo,
            mun: muniCode,
            file0: base64,
            filename: file.name,
            mimeType: file.type
        };

        if (tipo === 'obra' && obraId) {
            fields.obra = obraId; // Clave específica para obras
        }

        for (const key in fields) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = fields[key];
            form.appendChild(input);
        }

        document.body.appendChild(form);

        // 4. Manejar respuesta
        let procesado = false;
        
        // Timeout de seguridad (30s) por si el iframe nunca carga
        const timeoutId = setTimeout(() => {
            if (!procesado) {
                console.warn("⚠️ Timeout esperando respuesta del servidor");
                cleanup(false); // Asumimos fallo o que no pudimos leer respuesta
            }
        }, 30000); 

        iframe.onload = () => {
            if (procesado) return;
            procesado = true;
            clearTimeout(timeoutId);

            // Apps Script suele devolver JSON, pero CORS bloquea leer iframe.contentDocument
            // Sin embargo, si el script devuelve 200 OK, onload se dispara.
            // Asumimos éxito si onload dispara sin errores de red previos.
            
            // Intentamos leer por si estamos en mismo dominio o configuración permisiva (raro en Apps Script)
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc && doc.body.innerText.includes("error")) {
                    console.error("❌ Error detectado en respuesta iframe:", doc.body.innerText);
                    cleanup(false);
                } else {
                    console.log("✅ Iframe cargado (Asumiendo éxito por restricción CORS)");
                    cleanup(true);
                }
            } catch (e) {
                // Bloqueo CORS es normal aquí. Si llegó a onload, el POST llegó al servidor.
                console.log("✅ Subida completada (CORS opaco)");
                cleanup(true);
            }
        };

        const cleanup = (success) => {
            setTimeout(() => {
                try { form.remove(); } catch(e){}
                try { iframe.remove(); } catch(e){}
            }, 100);
            resolve(success);
        };

        // 5. Enviar
        try {
            form.submit();
        } catch (err) {
            console.error("❌ Error al hacer submit:", err);
            cleanup(false);
        }
    }
};