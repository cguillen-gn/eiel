/**
 * EIEL — lógica compartida de formularios
 * Fuente única para progreso, subidas, validaciones y utilidades de UI.
 * Debe cargarse después de definir window.EIEL_CONFIG (parcial) en base.html.
 */
(function (global) {
    "use strict";

    const LIMITE_BYTES = 35 * 1024 * 1024;
    const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function getSessionToken() {
        return localStorage.getItem("eiel_session_token") || "";
    }

    function requireSessionToken() {
        // Tokens desactivados temporalmente: no bloquear envíos.
        return localStorage.getItem("eiel_session_token") || "";
    }

    function getIsTest() {
        return localStorage.getItem("eiel_is_test") === "true";
    }

    /** Quita prefijos repetidos "Error:" de mensajes de Apps Script / Exceptions. */
    function cleanErrorText(msg) {
        let s = String(msg == null ? "" : msg).trim();
        while (/^Error:\s*/i.test(s)) {
            s = s.replace(/^Error:\s*/i, "").trim();
        }
        return s || "Error desconocido";
    }

    /**
     * Errores definitivos: reintentar no ayuda y puede tapar el mensaje útil
     * (p. ej. 2º intento Apps Script → HTML 404 → "Respuesta no válida").
     */
    function isNonRetryableUploadError(err) {
        const s = cleanErrorText(err && err.message != null ? err.message : err).toLowerCase();
        if (!s) return false;
        if (s.indexOf("sesión") !== -1) return true;
        if (s.indexOf("caducad") !== -1) return true;
        if (s.indexOf("vuelva a iniciar sesión") !== -1) return true;
        if (s.indexOf("vuelva a entrar") !== -1) return true;
        if (s.indexOf("35 mb") !== -1 || s.indexOf("supera el") !== -1) return true;
        if (s.indexOf("faltan datos") !== -1) return true;
        if (s.indexOf("no autorizado") !== -1) return true;
        return false;
    }

    var EIEL_CONTACTO_AYUDA_JS = "eiel@geonet.es";
    var MSG_USUARIO_SESION =
        "Su sesión no es válida o ha caducado. Cierre sesión, vuelva a entrar e inténtelo de nuevo. Si necesita ayuda, escriba a " +
        EIEL_CONTACTO_AYUDA_JS +
        ".";
    var MSG_USUARIO_ENVIO =
        "Ha ocurrido un problema al completar el envío. Espere unos segundos e inténtelo de nuevo. Si el problema continúa, escriba a " +
        EIEL_CONTACTO_AYUDA_JS +
        " indicando municipio y formulario.";

    /** Prefiere un error con mensaje de negocio frente a fallo opaco de red/HTML. */
    function isOpaqueUploadError(err) {
        const s = cleanErrorText(err && err.message != null ? err.message : err).toLowerCase();
        return (
            s.indexOf("respuesta no válida") !== -1 ||
            s.indexOf("failed to fetch") !== -1 ||
            s.indexOf("networkerror") !== -1 ||
            s.indexOf("comprobar el despliegue") !== -1 ||
            // doGet vacío / redirect POST→GET de Apps Script
            s.indexOf("use post para subir") !== -1 ||
            s.indexOf("get inesperado") !== -1
        );
    }

    /**
     * Texto para el técnico tras fallo de subida/PDF.
     * Detalle técnico → console; al usuario solo genérico (o sesión).
     */
    function formatUserError(err) {
        const raw = cleanErrorText(err && err.message != null ? err.message : err);
        console.error("[EIEL] Error de envío (detalle):", raw);
        const lower = raw.toLowerCase();
        if (lower.indexOf("sesión") !== -1) {
            return "❌ " + MSG_USUARIO_SESION;
        }
        return "❌ " + MSG_USUARIO_ENVIO;
    }

    /** Error lanzable en subida/PDF: sesión o genérico (detalle ya en console). */
    function userFacingSendError(err) {
        const raw = cleanErrorText(err && err.message != null ? err.message : err);
        console.error("[EIEL] Fallo técnico:", raw);
        if (raw.toLowerCase().indexOf("sesión") !== -1) {
            return new Error(MSG_USUARIO_SESION);
        }
        return new Error(MSG_USUARIO_ENVIO);
    }

    /**
     * Fusiona configuración del formulario preservando / refrescando isTest.
     */
    function mergeConfig(partial) {
        global.EIEL_CONFIG = Object.assign({}, global.EIEL_CONFIG || {}, partial || {}, {
            isTest: getIsTest()
        });
        return global.EIEL_CONFIG;
    }

    function applyHeaderTheme(themeName) {
        const header = document.querySelector(".site-header");
        if (header) header.classList.add("header-" + themeName);
    }

    function mostrarMensaje(texto, tipo) {
        const mensajeDiv = document.getElementById("mensaje");
        if (!mensajeDiv) return;
        mensajeDiv.textContent = texto;
        mensajeDiv.className = "message " + tipo;
        mensajeDiv.classList.remove("hidden");
        // Si hay campos marcados inválidos, priorizar scroll/foco a ellos
        // (el aviso suele estar abajo junto a Enviar y taparía el campo).
        const invalid = document.querySelector(".is-invalid");
        if (invalid) {
            try {
                invalid.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch (e) {
                /* ignore */
            }
            try {
                if (typeof invalid.focus === "function") {
                    invalid.focus({ preventScroll: true });
                }
            } catch (e2) {
                try {
                    invalid.focus();
                } catch (e3) {
                    /* ignore */
                }
            }
            return;
        }
        mensajeDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function hideMensaje() {
        const mensajeDiv = document.getElementById("mensaje");
        if (mensajeDiv) mensajeDiv.classList.add("hidden");
    }

    function setupConformidad() {
        const btnEnviar = document.getElementById("btnEnviar");
        const checkConformidad = document.getElementById("checkConformidad");
        if (checkConformidad && btnEnviar) {
            checkConformidad.addEventListener("change", function () {
                btnEnviar.disabled = !this.checked;
            });
        }
    }

    function setupSelectHasValue() {
        const handleSelectColor = (el) => {
            if (el.value === "") el.classList.remove("has-value");
            else el.classList.add("has-value");
        };
        document.querySelectorAll(".form-select").forEach((select) => {
            handleSelectColor(select);
            select.addEventListener("change", () => handleSelectColor(select));
        });
    }

    function filterFilesBySize(files) {
        return Array.from(files).filter((f) => {
            if (f.size > LIMITE_BYTES) {
                alert('El archivo "' + f.name + '" supera el límite de 35 MB y no será añadido.');
                return false;
            }
            return true;
        });
    }

    const UIProgress = {
        container: null,
        bar: null,
        text: null,
        percent: null,
        maxReached: 0,

        _ensureEls() {
            this.container = document.getElementById("overlayProgress");
            this.bar = document.getElementById("progressBar");
            this.text = document.getElementById("progressText");
            this.percent = document.getElementById("progressValue");
        },

        show(totalTasks) {
            this._ensureEls();
            this.maxReached = 0;
            const title = document.getElementById("progressTitle");
            if (title) title.textContent = "Enviando datos...";

            const elements = document.getElementById("progressElements");
            if (elements) elements.classList.remove("hidden");

            const success = document.getElementById("successState");
            if (success) success.classList.add("hidden");

            if (this.container) this.container.classList.remove("hidden");
            this.update(0, totalTasks, "Iniciando el envío...");
        },

        update(completed, total, message) {
            this._ensureEls();
            const msg = message.toLowerCase();
            const isFinalStep =
                msg.includes("pdf") || msg.includes("registro") || msg.includes("justificante");

            let targetPercentage = 0;
            if (total > 0) {
                const fileWeight = 90 / total;
                targetPercentage = isFinalStep ? 95 : Math.round(completed * fileWeight);
            } else {
                targetPercentage = isFinalStep ? 95 : 0;
            }

            if (targetPercentage > this.maxReached) {
                this.maxReached = targetPercentage;
                if (this.bar) this.bar.style.width = this.maxReached + "%";
                if (this.percent) this.percent.textContent = this.maxReached + "%";
            }
            if (this.text && message) this.text.textContent = message;
        },

        complete() {
            const title = document.getElementById("progressTitle");
            if (title) title.textContent = "¡Envío Finalizado!";

            const elements = document.getElementById("progressElements");
            if (elements) elements.classList.add("hidden");

            const success = document.getElementById("successState");
            if (success) success.classList.remove("hidden");

            if (global.lucide) lucide.createIcons();
        },

        hide() {
            this._ensureEls();
            if (this.container) this.container.classList.add("hidden");
            const success = document.getElementById("successState");
            if (success) success.classList.add("hidden");
            const elements = document.getElementById("progressElements");
            if (elements) elements.classList.remove("hidden");
        }
    };

    const UploadService = {
        toBase64: (file) =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(",")[1]);
                reader.onerror = (error) => reject(error);
            }),

        /**
         * Comprime imágenes antes de subir (Apps Script falla con JPG de cámara).
         * options.maxSide (default 1280), quality (0.72), targetBytes (700KB).
         */
        maybeCompressImage(file, options) {
            options = options || {};
            const maxSide = options.maxSide != null ? options.maxSide : 1280;
            const quality = options.quality != null ? options.quality : 0.72;
            const targetBytes = options.targetBytes != null ? options.targetBytes : 700 * 1024;

            const compressOnce = (srcFile, side, q) =>
                new Promise((resolve) => {
                    try {
                        const type = (srcFile && srcFile.type) || "";
                        if (!type || type.indexOf("image/") !== 0) {
                            resolve(srcFile);
                            return;
                        }
                        if (
                            type.indexOf("svg") !== -1 ||
                            type.indexOf("heic") !== -1 ||
                            type.indexOf("heif") !== -1
                        ) {
                            resolve(srcFile);
                            return;
                        }
                        const url = URL.createObjectURL(srcFile);
                        const img = new Image();
                        img.onload = () => {
                            try {
                                let w = img.naturalWidth || img.width;
                                let h = img.naturalHeight || img.height;
                                if (!w || !h) {
                                    URL.revokeObjectURL(url);
                                    resolve(srcFile);
                                    return;
                                }
                                const scale = Math.min(1, side / Math.max(w, h));
                                w = Math.max(1, Math.round(w * scale));
                                h = Math.max(1, Math.round(h * scale));
                                const canvas = document.createElement("canvas");
                                canvas.width = w;
                                canvas.height = h;
                                const ctx = canvas.getContext("2d");
                                ctx.drawImage(img, 0, 0, w, h);
                                canvas.toBlob(
                                    (blob) => {
                                        URL.revokeObjectURL(url);
                                        if (!blob) {
                                            resolve(srcFile);
                                            return;
                                        }
                                        resolve(
                                            new File([blob], srcFile.name, {
                                                type: "image/jpeg",
                                                lastModified: Date.now()
                                            })
                                        );
                                    },
                                    "image/jpeg",
                                    q
                                );
                            } catch (e) {
                                URL.revokeObjectURL(url);
                                resolve(srcFile);
                            }
                        };
                        img.onerror = () => {
                            URL.revokeObjectURL(url);
                            resolve(srcFile);
                        };
                        img.src = url;
                    } catch (e) {
                        resolve(srcFile);
                    }
                });

            return (async () => {
                const type = (file && file.type) || "";
                if (!type || type.indexOf("image/") !== 0) return file;
                // Siempre recomprimir fotos de cámara (aunque el type diga jpeg "pequeño")
                let current = file;
                let side = maxSide;
                let q = quality;
                for (let pass = 0; pass < 3; pass++) {
                    if (current.size && current.size <= targetBytes && pass > 0) break;
                    if (current.size && current.size < 350 * 1024 && pass === 0) break;
                    const next = await compressOnce(current, side, q);
                    if (!next || next === current) break;
                    console.info(
                        "[EIEL] Foto comprimida",
                        file.name,
                        Math.round(file.size / 1024) + "KB → " + Math.round(next.size / 1024) + "KB",
                        "(pass " + (pass + 1) + ")"
                    );
                    current = next;
                    if (current.size <= targetBytes) break;
                    side = Math.round(side * 0.75);
                    q = Math.max(0.5, q - 0.12);
                }
                return current;
            })();
        },

        /**
         * Detecta si el Web App desplegado entiende action=check.
         * La versión antigua responde «Faltan datos necesarios…» (exige bytesBase64).
         * @returns {"ok"|"outdated"|"unknown"}
         */
        async probeCheckSupport() {
            const payload = {
                action: "check",
                filename: "__eiel_probe__.jpg",
                municipio: global.EIEL_CONFIG.muniCode || "000",
                tipo: "general",
                seccion: "GENERAL",
                id_envio: "EIEL_PROBE_CHECK",
                session_token: requireSessionToken()
            };
            try {
                const response = await fetch(global.EIEL_CONFIG.urlAdjuntos, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify(payload),
                    redirect: "follow"
                });
                const raw = await response.text();
                let result = null;
                try {
                    result = JSON.parse(raw);
                } catch (e) {
                    return "unknown";
                }
                if (
                    result &&
                    result.status === "error" &&
                    String(result.message || "")
                        .toLowerCase()
                        .indexOf("faltan datos") !== -1
                ) {
                    return "outdated";
                }
                if (
                    result &&
                    (result.status === "success" ||
                        result.status === "missing" ||
                        result.supports_check === true)
                ) {
                    return "ok";
                }
                return "unknown";
            } catch (e) {
                return "unknown";
            }
        },

        /**
         * Comprueba si el fichero ya está en Drive (tras un 404 opaco), sin reenviar bytes.
         */
        async checkExists(fileName, tipoFicha, muniCode, seccion, idEnvio) {
            const payload = {
                action: "check",
                filename: fileName,
                municipio: muniCode,
                tipo: tipoFicha,
                seccion: seccion == null ? "DOCUMENTACION" : seccion,
                id_envio: idEnvio,
                session_token: requireSessionToken()
            };
            const response = await fetch(global.EIEL_CONFIG.urlAdjuntos, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                redirect: "follow"
            });
            const raw = await response.text();
            let result = null;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                return false;
            }
            if (
                result &&
                result.status === "error" &&
                String(result.message || "").toLowerCase().indexOf("faltan datos") !== -1
            ) {
                console.warn(
                    "[EIEL] El Web App de Adjuntos no reconoce action=check. " +
                        "Pegue appscript/adjuntos.gs del repo y publique Nueva versión."
                );
            }
            return !!(result && result.status === "success");
        },

        /**
         * Tras un 404 opaco: pregunta varias veces a check antes de reenviar.
         * El archivo suele estar ya en Drive; evita reuploads lentos/duplicados.
         * @returns {Promise<boolean>}
         */
        async pollCheckExists(fileName, tipoFicha, muniCode, seccion, idEnvio, options) {
            options = options || {};
            const attempts = options.attempts != null ? options.attempts : 3;
            const firstDelayMs = options.firstDelayMs != null ? options.firstDelayMs : 800;
            const gapMs = options.gapMs != null ? options.gapMs : 1000;
            for (let i = 0; i < attempts; i++) {
                await new Promise((r) =>
                    setTimeout(r, i === 0 ? firstDelayMs : gapMs)
                );
                try {
                    const yaEsta = await this.checkExists(
                        fileName,
                        tipoFicha,
                        muniCode,
                        seccion,
                        idEnvio
                    );
                    if (yaEsta) {
                        if (i > 0) {
                            console.info(
                                "[EIEL] check OK en intento de poll",
                                i + 1 + "/" + attempts + ":",
                                fileName
                            );
                        }
                        return true;
                    }
                } catch (checkErr) {
                    console.warn(
                        "[EIEL] checkExists poll",
                        i + 1 + "/" + attempts,
                        "falló:",
                        checkErr
                    );
                }
            }
            return false;
        },

        /**
         * Sube un adjunto y exige respuesta JSON legible (status === "success").
         * Usa Content-Type text/plain como el login, para evitar preflight CORS.
         * options.compress: ajustes de maybeCompressImage
         */
        async uploadFile(file, tipoFicha, muniCode, seccion, idEnvio, options) {
            options = options || {};
            const ready = await this.maybeCompressImage(file, options.compress || {});
            if (ready && ready.size && file && file.size && ready.size < file.size) {
                // ok
            } else if (ready && file && /image\//.test(file.type || "") && ready.size > 1500 * 1024) {
                console.warn(
                    "[EIEL] Foto sigue siendo grande tras comprimir:",
                    file.name,
                    Math.round(ready.size / 1024) + "KB"
                );
            }
            const base64 = await this.toBase64(ready);
            const userEmail =
                (document.getElementById("contactoEmail") &&
                    document.getElementById("contactoEmail").value) ||
                "anonimo";
            const payload = {
                filename: file.name,
                mimeType: ready.type || file.type || "application/octet-stream",
                bytesBase64: base64,
                municipio: muniCode,
                usuario: userEmail,
                tipo: tipoFicha,
                seccion: seccion == null ? "DOCUMENTACION" : seccion,
                id_envio: idEnvio,
                session_token: requireSessionToken()
            };

            const response = await fetch(global.EIEL_CONFIG.urlAdjuntos, {
                method: "POST",
                // Igual que el login: text/plain evita preflight y permite leer JSON
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                redirect: "follow"
            });

            let result = null;
            const raw = await response.text();
            try {
                result = JSON.parse(raw);
            } catch (parseErr) {
                console.error(
                    "[EIEL] Respuesta no JSON al subir:",
                    file.name,
                    (raw || "").slice(0, 200)
                );
                throw userFacingSendError(
                    new Error(
                        'Respuesta no válida del servidor al subir "' +
                            file.name +
                            '". Compruebe el despliegue de Apps Script.'
                    )
                );
            }

            if (!response.ok || !result || result.status !== "success") {
                const detalle = cleanErrorText(
                    (result && result.message) ||
                        "HTTP " + response.status ||
                        "Error desconocido"
                );
                throw userFacingSendError(
                    new Error('No se pudo subir "' + file.name + '": ' + detalle)
                );
            }

            return true;
        }
    };

    /**
     * Extrae solo ficheros reales de un drop (rechaza carpetas).
     * Usa webkitGetAsEntry cuando existe; si no, descarta stubs vacíos tipicos de carpetas.
     * @returns {{ files: File[], skippedFolders: number }}
     */
    function collectDroppedFiles(dataTransfer) {
        const files = [];
        let skippedFolders = 0;
        if (!dataTransfer) return { files, skippedFolders };

        const items = dataTransfer.items;
        if (items && items.length) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind !== "file") continue;
                const entry =
                    typeof item.webkitGetAsEntry === "function"
                        ? item.webkitGetAsEntry()
                        : null;
                if (entry) {
                    if (entry.isDirectory) {
                        skippedFolders += 1;
                        continue;
                    }
                    if (!entry.isFile) continue;
                }
                const f = item.getAsFile();
                if (f) files.push(f);
            }
            return { files, skippedFolders };
        }

        // Fallback (navegadores sin items): filtrar stubs de carpeta (size 0, sin type).
        Array.from(dataTransfer.files || []).forEach((f) => {
            if (f && f.size === 0 && !f.type) {
                skippedFolders += 1;
                return;
            }
            files.push(f);
        });
        return { files, skippedFolders };
    }

    /**
     * Gestor de adjuntos generales (input + lista + drop zone opcional).
     * options.markDirtyOnDrop: default true (equipamientos usa false).
     * options.clearEmptyList: default true (equipamientos usa false → siempre map).
     */
    function createGeneralFileManager(options) {
        options = options || {};
        const markDirtyOnDrop = options.markDirtyOnDrop !== false;
        const clearEmptyList = options.clearEmptyList !== false;

        let archivos = [];
        const fileInput = document.getElementById(options.inputId || "fileInput");
        const fileList = document.getElementById(options.listId || "fileList");

        function renderArchivos() {
            if (!fileList) return;
            if (clearEmptyList && archivos.length === 0) {
                fileList.innerHTML = "";
                return;
            }
            fileList.innerHTML = archivos
                .map(
                    (f, i) => `
            <div class="file-item">
                <span>📄 ${f.name}</span>
                <button type="button" onclick="eliminarArchivo(${i})" class="btn-danger-icon">
                    <i data-lucide="trash-2" class="icon-trash-lg"></i>
                </button>
            </div>
        `
                )
                .join("");
            if (global.lucide) lucide.createIcons();
        }

        if (fileInput) {
            const onFiles = () => {
                global.formSucio = true;
                const validos = filterFilesBySize(fileInput.files);
                archivos.push(...validos);
                renderArchivos();
                fileInput.value = "";
            };
            if (options.useAddEventListener) {
                fileInput.addEventListener("change", onFiles);
            } else {
                fileInput.onchange = onFiles;
            }
        }

        const dropZone = document.querySelector(
            options.dropZoneSelector || ".file-upload-area"
        );
        if (dropZone) {
            ["dragenter", "dragover", "dragleave", "drop"].forEach((name) => {
                dropZone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });
            ["dragenter", "dragover"].forEach((name) => {
                dropZone.addEventListener(name, () => dropZone.classList.add("drag-over"));
            });
            ["dragleave", "drop"].forEach((name) => {
                dropZone.addEventListener(name, () => dropZone.classList.remove("drag-over"));
            });
            dropZone.addEventListener("drop", (e) => {
                const picked = collectDroppedFiles(e.dataTransfer);
                if (picked.skippedFolders > 0) {
                    alert(
                        "No se pueden adjuntar carpetas. Seleccione o arrastre solo archivos."
                    );
                }
                if (picked.files.length > 0) {
                    if (markDirtyOnDrop) global.formSucio = true;
                    // Paridad: el drop histórico no filtraba 35 MB (sí el input y el submit).
                    archivos.push(...picked.files);
                    renderArchivos();
                }
            });
        }

        global.eliminarArchivo = (i) => {
            global.formSucio = true;
            archivos.splice(i, 1);
            renderArchivos();
        };

        return {
            getFiles: () => archivos,
            setFiles: (next) => {
                archivos = next;
            },
            clear: () => {
                archivos = [];
                renderArchivos();
            },
            render: renderArchivos
        };
    }

    function renderColaReqStandard(id, cola) {
        const contenedor = document.getElementById("lista_adjuntos_req_" + id);
        if (!contenedor) return;
        const archivosReq = cola[id] || [];
        contenedor.innerHTML = archivosReq
            .map(
                (f, i) => `
            <div class="file-item file-item--compact">
                <span class="file-item-name"><i data-lucide="paperclip" class="icon-xs"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon btn-danger-icon--ghost">
                    <i data-lucide="trash-2" class="icon-trash"></i>
                </button>
            </div>
        `
            )
            .join("");
        if (global.lucide) lucide.createIcons();
    }

    function renderColaReqAlumbrado(id, cola) {
        const contenedor = document.getElementById("lista_adjuntos_req_" + id);
        if (!contenedor) return;
        const archivosReq = cola[id] || [];
        contenedor.innerHTML = archivosReq
            .map(
                (f, i) => `
            <div class="file-item file-item--compact">
                <span class="file-item-name--ellipsis" title="${f.name}">
                    <i data-lucide="paperclip" class="icon-xs-muted"></i> ${f.name}
                </span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon btn-danger-icon--ghost">
                    <i data-lucide="trash-2" class="icon-trash"></i>
                </button>
            </div>
        `
            )
            .join("");
        if (global.lucide) lucide.createIcons();
    }

    function renderColaReqObras(id, cola) {
        const contenedor = document.getElementById("lista_adjuntos_req_" + id);
        if (!contenedor) return;
        const archivosReq = cola[id] || [];
        contenedor.innerHTML = archivosReq
            .map(
                (f, i) => `
            <div class="file-item file-item--compact-plain">
                <span class="file-item-name"><i data-lucide="paperclip" class="icon-xs"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon">
                    <i data-lucide="trash-2" class="icon-trash"></i>
                </button>
            </div>
        `
            )
            .join("");
        if (global.lucide) lucide.createIcons();
    }

    function renderColaReqEquipamientos(id, cola) {
        const contenedor = document.getElementById("lista_adjuntos_req_" + id);
        if (!contenedor) return;
        const archivosReq = cola[id] || [];
        contenedor.innerHTML = archivosReq
            .map(
                (f, i) => `
            <div class="file-item file-item--compact-plain-nogap">
                <span class="file-item-name"><i data-lucide="paperclip" class="icon-xs"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon">
                    <i data-lucide="trash-2" class="icon-trash"></i>
                </button>
            </div>
        `
            )
            .join("");
        if (global.lucide) lucide.createIcons();
    }

    const REQ_RENDERERS = {
        standard: renderColaReqStandard,
        alumbrado: renderColaReqAlumbrado,
        obras: renderColaReqObras,
        equipamientos: renderColaReqEquipamientos
    };

    /**
     * Gestor de adjuntos por requerimiento (hiddenInputReq).
     * options.variant: 'standard' | 'alumbrado' | 'obras' | 'equipamientos'
     */
    const INVALID_CLASS = "is-invalid";

    function bindClearInvalidOnce() {
        if (document.documentElement.dataset.eielInvalidBound === "1") return;
        document.documentElement.dataset.eielInvalidBound = "1";
        const clearIfMarked = (e) => {
            const t = e.target;
            if (t && t.classList && t.classList.contains(INVALID_CLASS)) {
                t.classList.remove(INVALID_CLASS);
            }
        };
        document.addEventListener("input", clearIfMarked, true);
        document.addEventListener("change", clearIfMarked, true);
    }

    function markInvalid(el) {
        if (!el) return;
        bindClearInvalidOnce();
        el.classList.add(INVALID_CLASS);
    }

    function clearInvalid(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll("." + INVALID_CLASS).forEach((el) => {
            el.classList.remove(INVALID_CLASS);
        });
    }

    function focusFirstInvalid(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const el = scope.querySelector("." + INVALID_CLASS);
        if (!el) return;
        try {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (e) {
            /* ignore */
        }
        try {
            if (typeof el.focus === "function") el.focus({ preventScroll: true });
        } catch (e2) {
            try {
                el.focus();
            } catch (e3) {
                /* ignore */
            }
        }
    }

    function validateContact() {
        bindClearInvalidOnce();
        const elNombre = document.getElementById("contactoNombre");
        const elEmail = document.getElementById("contactoEmail");
        const elEmailConf = document.getElementById("contactoEmailConfirm");
        [elNombre, elEmail, elEmailConf].forEach((el) => {
            if (el) el.classList.remove(INVALID_CLASS);
        });

        const nombre = elNombre ? elNombre.value.trim() : "";
        const email = elEmail ? elEmail.value.trim() : "";
        const emailConf = elEmailConf ? elEmailConf.value.trim() : "";

        if (nombre.length < 2) {
            markInvalid(elNombre);
            return {
                ok: false,
                message: "⚠️ Por favor, introduzca su nombre y apellidos."
            };
        }
        if (!REGEX_EMAIL.test(email) || email.toLowerCase() !== emailConf.toLowerCase()) {
            markInvalid(elEmail);
            markInvalid(elEmailConf);
            return {
                ok: false,
                message: "⚠️ Verifique que el Email sea válido y coincida en ambos campos."
            };
        }
        return {
            ok: true,
            nombre: nombre,
            email: email,
            departamento: document.getElementById("contactoDepartamento").value.trim()
        };
    }

    /**
     * options.message: texto exacto del aviso de requerimientos incompletos.
     */
    function validateRequerimientos(colaAdjuntosReq, options) {
        options = options || {};
        const message =
            options.message ||
            "⚠️ Debe dar una respuesta individualizada (texto o adjunto) a cada uno de los requerimientos del apartado «Otra Información Solicitada».";

        const areasReq = document.querySelectorAll(".txt-resp-req");
        let reqIncompletos = false;
        const respuestasReq = [];

        areasReq.forEach((area) => {
            area.classList.remove(INVALID_CLASS);
            const id = area.dataset.id;
            const resp = area.value.trim();
            const adjuntos = colaAdjuntosReq[id] || [];

            if (resp === "" && adjuntos.length === 0) {
                reqIncompletos = true;
                markInvalid(area);
            } else {
                respuestasReq.push({
                    pregunta: area.dataset.msg,
                    respuesta: resp,
                    archivos: adjuntos.map((f) => f.name).join("; ")
                });
            }
        });

        if (reqIncompletos) {
            return { ok: false, message: message, respuestas: [] };
        }
        return { ok: true, respuestas: respuestasReq };
    }

    function createReqAttachmentManager(options) {
        options = options || {};
        const variant = options.variant || "standard";
        const renderFn = REQ_RENDERERS[variant] || renderColaReqStandard;

        let colaAdjuntosReq = {};
        let reqIdActual = null;
        const inputReq = document.getElementById(options.inputId || "hiddenInputReq");

        function renderColaReq(id) {
            renderFn(id, colaAdjuntosReq);
        }

        global.gestionarAdjuntosReq = (id) => {
            reqIdActual = id;
            if (inputReq) inputReq.click();
        };

        if (inputReq) {
            inputReq.addEventListener("change", () => {
                global.formSucio = true;
                const files = Array.from(inputReq.files);
                if (!files.length || reqIdActual === null) return;

                const validos = filterFilesBySize(files);
                if (validos.length > 0) {
                    if (!colaAdjuntosReq[reqIdActual]) colaAdjuntosReq[reqIdActual] = [];
                    colaAdjuntosReq[reqIdActual].push(...validos);
                    renderColaReq(reqIdActual);
                    const area = document.querySelector(
                        '.txt-resp-req[data-id="' + reqIdActual + '"]'
                    );
                    if (area) area.classList.remove(INVALID_CLASS);
                }

                inputReq.value = "";
                reqIdActual = null;
            });
        }

        global.eliminarArchivoReq = (id, i) => {
            global.formSucio = true;
            colaAdjuntosReq[id].splice(i, 1);
            renderColaReq(id);
        };

        return {
            getCola: () => colaAdjuntosReq,
            setCola: (next) => {
                colaAdjuntosReq = next;
            },
            clear: () => {
                colaAdjuntosReq = {};
            },
            render: renderColaReq
        };
    }

    function findOversizedFile(fileLists) {
        const todos = [];
        fileLists.forEach((list) => {
            if (!list) return;
            if (Array.isArray(list)) todos.push(...list);
            else todos.push(...Object.values(list).flat());
        });
        return todos.find((f) => f.size > LIMITE_BYTES) || null;
    }

    let submitStartedAtIso = null;

    function startSubmitTimer() {
        submitStartedAtIso = new Date().toISOString();
    }

    function clearSubmitTimer() {
        submitStartedAtIso = null;
    }

    function buildBasePayload(fields) {
        const cfg = global.EIEL_CONFIG;
        if (!submitStartedAtIso) startSubmitTimer();
        return Object.assign(
            {
                fase: cfg.fase,
                id_envio: fields.idBatch,
                is_test: getIsTest(),
                nombre_contacto: fields.nombre,
                departamento_contacto: fields.departamento,
                email_contacto: fields.email,
                municipio_codigo: cfg.muniCode,
                municipio_nombre: localStorage.getItem("eiel_muni_name") || cfg.muniName,
                timestamp_envio: new Date().toISOString(),
                envio_started_at: submitStartedAtIso,
                session_token: requireSessionToken()
            },
            fields.extra || {}
        );
    }

    /**
     * tasks: [{ file, seccion, tipo? }]
     * Sube con cola limitada (paralelo suave); reintenta si falla; si tras los
     * reintentos sigue mal, aborta el lote (no se debe llamar a generar PDF).
     * options.retries: por defecto 2
     * options.concurrency: por defecto 3 (1 = serie)
     * options.throwOnFail: por defecto true
     */
    async function uploadTaskList(tasks, idBatch, options) {
        options = options || {};
        // Cronómetro de envío completo (adjuntos + PDF).
        if (!submitStartedAtIso) startSubmitTimer();
        const retries = options.retries != null ? options.retries : 2;
        const delayMs = options.delayMs != null ? options.delayMs : 0;
        const retryDelayMs = options.retryDelayMs != null ? options.retryDelayMs : 1200;
        const checkDelayMs = options.checkDelayMs != null ? options.checkDelayMs : 800;
        const checkPollAttempts =
            options.checkPollAttempts != null ? options.checkPollAttempts : 3;
        const checkPollGapMs =
            options.checkPollGapMs != null ? options.checkPollGapMs : 1000;
        const concurrency = Math.max(
            1,
            options.concurrency != null ? options.concurrency : 3
        );
        const throwOnFail = options.throwOnFail !== false;
        const defaultTipo = options.defaultTipo;
        // No-imágenes primero (calientan Apps Script); fotos después.
        const ordered = tasks.slice().sort((a, b) => {
            const ai = ((a.file && a.file.type) || "").indexOf("image/") === 0 ? 1 : 0;
            const bi = ((b.file && b.file.type) || "").indexOf("image/") === 0 ? 1 : 0;
            return ai - bi;
        });
        const totalTareas = ordered.length;
        let completados = 0;
        let abortAll = false;
        let fatalError = null;

        function bumpProgress() {
            UIProgress.update(
                completados,
                totalTareas,
                "Subiendo archivos adjuntos (Subido " +
                    completados +
                    " de " +
                    totalTareas +
                    " archivos)..."
            );
        }

        // Sin action=check desplegado, los 404 opacos de Apps Script no se pueden
        // recuperar y los reintentos duplican ficheros en Drive.
        if (options.skipDeployProbe !== true && totalTareas > 0) {
            const probe = await UploadService.probeCheckSupport();
            if (probe === "outdated") {
                const msg =
                    "El Web App de Adjuntos en Google no está actualizado (no reconoce action=check). " +
                    "En Apps Script: pegue appscript/adjuntos.gs del repo → Implementar → " +
                    "Administrar implementaciones → editar la existente → Nueva versión. " +
                    "Guía: appscript/DESPLIEGUE-ADJUNTOS.md. Hasta entonces las fotos fallarán o se duplicarán.";
                console.error("[EIEL]", msg);
                if (throwOnFail) {
                    UIProgress.hide();
                    throw userFacingSendError(new Error(msg));
                }
            }
        }

        async function uploadOne(tarea) {
            if (abortAll) return;
            bumpProgress();

            const tipo = tarea.tipo || defaultTipo;
            let lastError = null;
            let bestError = null;
            let exitoSubida = false;
            let uploadOpts = {};
            const isImage =
                tarea.file &&
                tarea.file.type &&
                tarea.file.type.indexOf("image/") === 0;
            const sizeFactor =
                isImage || (tarea.file && tarea.file.size > 1.5 * 1024 * 1024) ? 2 : 1;

            for (let intento = 1; intento <= retries; intento++) {
                if (abortAll) return;
                try {
                    if (intento > 1 && isImage) {
                        uploadOpts = {
                            compress: {
                                maxSide: 960,
                                quality: 0.58,
                                targetBytes: 450 * 1024
                            }
                        };
                    }
                    await UploadService.uploadFile(
                        tarea.file,
                        tipo,
                        global.EIEL_CONFIG.muniCode,
                        tarea.seccion,
                        idBatch,
                        uploadOpts
                    );
                    exitoSubida = true;
                    break;
                } catch (e) {
                    lastError = e;
                    if (!bestError || (isOpaqueUploadError(bestError) && !isOpaqueUploadError(e))) {
                        bestError = e;
                    } else if (!isOpaqueUploadError(e) && isNonRetryableUploadError(e)) {
                        bestError = e;
                    }
                    console.error(
                        (options.logPrefix || "Fallo en subida:") +
                            " intento " +
                            intento +
                            "/" +
                            retries,
                        e
                    );
                    if (isNonRetryableUploadError(e)) {
                        break;
                    }

                    if (isOpaqueUploadError(e)) {
                        const yaEsta = await UploadService.pollCheckExists(
                            tarea.file.name,
                            tipo,
                            global.EIEL_CONFIG.muniCode,
                            tarea.seccion,
                            idBatch,
                            {
                                attempts: checkPollAttempts,
                                firstDelayMs: checkDelayMs,
                                gapMs: checkPollGapMs
                            }
                        );
                        if (yaEsta) {
                            console.warn(
                                "[EIEL] Adjunto ya en Drive tras respuesta opaca:",
                                tarea.file.name
                            );
                            exitoSubida = true;
                            break;
                        }
                    }

                    if (intento < retries) {
                        const wait = retryDelayMs * sizeFactor * intento;
                        await new Promise((r) => setTimeout(r, wait));
                    }
                }
            }

            if (!exitoSubida) {
                const errFinal = bestError || lastError;
                let msg =
                    (errFinal && errFinal.message) ||
                    "No se pudo subir el archivo: " + tarea.file.name;
                if (isOpaqueUploadError(errFinal)) {
                    msg =
                        'Google Apps Script no respondió al subir "' +
                        tarea.file.name +
                        '". Espere unos segundos e inténtelo de nuevo (a veces el archivo ya quedó en Drive).';
                }
                if (throwOnFail) {
                    abortAll = true;
                    fatalError = userFacingSendError(new Error(msg));
                    return;
                }
                console.error(options.logPrefix || "Fallo en subida individual:", errFinal);
                return;
            }

            completados++;
            bumpProgress();
            if (delayMs > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }

        bumpProgress();
        let cursor = 0;
        async function worker() {
            while (true) {
                if (abortAll) return;
                const idx = cursor++;
                if (idx >= ordered.length) return;
                await uploadOne(ordered[idx]);
            }
        }
        const runners = Math.min(concurrency, Math.max(1, ordered.length));
        await Promise.all(
            Array.from({ length: runners }, function () {
                return worker();
            })
        );

        if (fatalError && throwOnFail) {
            UIProgress.hide();
            throw fatalError;
        }

        return completados;
    }

    /**
     * Interpreta la respuesta del script Generar PDF.
     * Acepta contrato nuevo { status: "success"|"error" } y el histórico { success: bool }.
     * null = JSON sin indicador conocido (legado opaco) → no bloquea.
     */
    function interpretPdfResult(result) {
        if (!result || typeof result !== "object") return null;
        if (typeof result.status === "string") {
            return result.status === "success";
        }
        if (typeof result.success === "boolean") {
            return result.success === true;
        }
        return null;
    }

    /**
     * Envía el payload al script de generar PDF.
     * Misma estrategia que adjuntos: text/plain (sin preflight) y JSON legible.
     */
    /**
     * Normaliza nombres de adjuntos para el PDF: array JSON (sin partir por comas)
     * + string con saltos de línea (compatibilidad).
     */
    function normalizeAdjuntosInPdfPayload(payload) {
        if (!payload || typeof payload !== "object") return payload;
        let names = [];
        if (Array.isArray(payload.lista_archivos)) {
            names = payload.lista_archivos;
        } else if (typeof payload.lista_archivos === "string" && payload.lista_archivos.trim()) {
            const t = payload.lista_archivos.trim();
            if (t.charAt(0) === "[") {
                try {
                    const parsed = JSON.parse(t);
                    if (Array.isArray(parsed)) names = parsed;
                } catch (e) {
                    names = t.split(/\r?\n/);
                }
            } else {
                names = t.split(/\r?\n/);
            }
        } else if (typeof payload.archivos_adjuntos === "string" && payload.archivos_adjuntos.trim()) {
            // Solo saltos de línea: "a, b.pdf" es UN nombre, no dos.
            names = payload.archivos_adjuntos.split(/\r?\n/);
        }
        names = names
            .map(function (n) {
                return String(n == null ? "" : n).trim();
            })
            .filter(Boolean);
        if (!names.length) return payload;
        const seen = {};
        const unique = [];
        names.forEach(function (n) {
            if (seen[n]) return;
            seen[n] = true;
            unique.push(n);
        });
        payload.lista_archivos = unique;
        payload.archivos_adjuntos = unique.join("\n");
        return payload;
    }

    async function sendPdfPayload(payload) {
        try {
            if (payload && !payload.envio_started_at && submitStartedAtIso) {
                payload.envio_started_at = submitStartedAtIso;
            }
            payload = normalizeAdjuntosInPdfPayload(payload);
            const response = await fetch(global.EIEL_CONFIG.urlGenerarPdf, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                redirect: "follow"
            });

            const raw = await response.text();
            let result = null;
            try {
                result = JSON.parse(raw);
            } catch (parseErr) {
                console.warn(
                    "[EIEL] Respuesta PDF no JSON (¿Apps Script antiguo?). " +
                        "Actualice appscript/generar-pdf.gs y redespliegue."
                );
                return true;
            }

            const ok = interpretPdfResult(result);
            if (ok === null) {
                console.warn(
                    "[EIEL] Respuesta PDF sin status/success; se asume OK (legado)."
                );
                return true;
            }

            if (!response.ok || !ok) {
                UIProgress.hide();
                const detalle = cleanErrorText(
                    (result && result.message) ||
                        "HTTP " + response.status ||
                        "Error desconocido"
                );
                throw userFacingSendError(new Error(detalle));
            }

            return true;
        } finally {
            clearSubmitTimer();
        }
    }

    /**
     * options.resetSelectIndex: default true (cementerios false)
     * options.clearHasValue: residuos true
     * options.afterReset: callback
     */
    function resetFormAfterSuccess(options) {
        options = options || {};
        const resetSelectIndex = options.resetSelectIndex !== false;
        const clearHasValue = !!options.clearHasValue;

        document.querySelectorAll(".file-list-container").forEach((el) => {
            el.innerHTML = "";
        });
        document.querySelectorAll("input, select, textarea").forEach((el) => {
            if (!["button", "submit", "checkbox"].includes(el.type)) el.value = "";
            if (el.tagName === "SELECT") {
                if (resetSelectIndex) el.selectedIndex = 0;
                if (clearHasValue) el.classList.remove("has-value");
            }
        });

        const checkConformidad = document.getElementById("checkConformidad");
        const btnEnviar = document.getElementById("btnEnviar");
        if (checkConformidad) checkConformidad.checked = false;
        if (btnEnviar) btnEnviar.disabled = true;

        if (typeof options.afterReset === "function") options.afterReset();
    }

    function newBatchId() {
        return "ENVIO_" + new Date().getTime();
    }

    function buildReqUploadTasks(colaAdjuntosReq) {
        const lista = [];
        Object.entries(colaAdjuntosReq).forEach(([id, listado]) => {
            const numReq = parseInt(id, 10) + 1;
            listado.forEach((file) =>
                lista.push({ file: file, seccion: "REQUERIMIENTO_" + numReq })
            );
        });
        return lista;
    }

    global.EIEL = {
        LIMITE_BYTES: LIMITE_BYTES,
        getIsTest: getIsTest,
        getSessionToken: getSessionToken,
        requireSessionToken: requireSessionToken,
        cleanErrorText: cleanErrorText,
        formatUserError: formatUserError,
        mergeConfig: mergeConfig,
        applyHeaderTheme: applyHeaderTheme,
        mostrarMensaje: mostrarMensaje,
        hideMensaje: hideMensaje,
        setupConformidad: setupConformidad,
        setupSelectHasValue: setupSelectHasValue,
        filterFilesBySize: filterFilesBySize,
        collectDroppedFiles: collectDroppedFiles,
        UIProgress: UIProgress,
        UploadService: UploadService,
        createGeneralFileManager: createGeneralFileManager,
        createReqAttachmentManager: createReqAttachmentManager,
        validateContact: validateContact,
        validateRequerimientos: validateRequerimientos,
        markInvalid: markInvalid,
        clearInvalid: clearInvalid,
        focusFirstInvalid: focusFirstInvalid,
        findOversizedFile: findOversizedFile,
        buildBasePayload: buildBasePayload,
        startSubmitTimer: startSubmitTimer,
        uploadTaskList: uploadTaskList,
        sendPdfPayload: sendPdfPayload,
        resetFormAfterSuccess: resetFormAfterSuccess,
        newBatchId: newBatchId,
        buildReqUploadTasks: buildReqUploadTasks
    };
})(window);
