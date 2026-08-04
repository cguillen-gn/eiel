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

    /** Prefiere un error con mensaje de negocio frente a fallo opaco de red/HTML. */
    function isOpaqueUploadError(err) {
        const s = cleanErrorText(err && err.message != null ? err.message : err).toLowerCase();
        return (
            s.indexOf("respuesta no válida") !== -1 ||
            s.indexOf("failed to fetch") !== -1 ||
            s.indexOf("networkerror") !== -1 ||
            s.indexOf("comprobar el despliegue") !== -1
        );
    }

    /** Texto para mostrar al técnico tras un fallo de envío/subida. */
    function formatUserError(err) {
        const msg = cleanErrorText(err && err.message != null ? err.message : err);
        return "❌ " + msg;
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
         * Comprime imágenes grandes antes de subir (Apps Script falla con JPG enormes).
         * Max lado 1600px, JPEG ~0.82. Si no es imagen o falla, devuelve el original.
         */
        maybeCompressImage(file) {
            return new Promise((resolve) => {
                try {
                    const type = (file && file.type) || "";
                    if (!type || type.indexOf("image/") !== 0) {
                        resolve(file);
                        return;
                    }
                    // HEIC/SVG/etc.: dejar pasar
                    if (
                        type.indexOf("svg") !== -1 ||
                        type.indexOf("heic") !== -1 ||
                        type.indexOf("heif") !== -1
                    ) {
                        resolve(file);
                        return;
                    }
                    // Ya es pequeña: no tocar
                    if (file.size && file.size < 900 * 1024) {
                        resolve(file);
                        return;
                    }

                    const url = URL.createObjectURL(file);
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const maxSide = 1600;
                            let w = img.naturalWidth || img.width;
                            let h = img.naturalHeight || img.height;
                            if (!w || !h) {
                                URL.revokeObjectURL(url);
                                resolve(file);
                                return;
                            }
                            const scale = Math.min(1, maxSide / Math.max(w, h));
                            w = Math.round(w * scale);
                            h = Math.round(h * scale);
                            const canvas = document.createElement("canvas");
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext("2d");
                            ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob(
                                (blob) => {
                                    URL.revokeObjectURL(url);
                                    if (!blob || blob.size >= file.size) {
                                        resolve(file);
                                        return;
                                    }
                                    // Conservar el nombre original (la verificación PDF usa ese nombre).
                                    resolve(
                                        new File([blob], file.name, {
                                            type: "image/jpeg",
                                            lastModified: Date.now()
                                        })
                                    );
                                },
                                "image/jpeg",
                                0.82
                            );
                        } catch (e) {
                            URL.revokeObjectURL(url);
                            resolve(file);
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        resolve(file);
                    };
                    img.src = url;
                } catch (e) {
                    resolve(file);
                }
            });
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
            return !!(result && result.status === "success");
        },

        /**
         * Sube un adjunto y exige respuesta JSON legible (status === "success").
         * Usa Content-Type text/plain como el login, para evitar preflight CORS.
         */
        async uploadFile(file, tipoFicha, muniCode, seccion, idEnvio) {
            const ready = await this.maybeCompressImage(file);
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
                throw new Error(
                    'Respuesta no válida del servidor al subir "' +
                        file.name +
                        '". Compruebe el despliegue de Apps Script.'
                );
            }

            if (!response.ok || !result || result.status !== "success") {
                const detalle = cleanErrorText(
                    (result && result.message) ||
                        "HTTP " + response.status ||
                        "Error desconocido"
                );
                throw new Error(
                    'No se pudo subir "' + file.name + '": ' + detalle
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

    function validateContact() {
        const nombre = document.getElementById("contactoNombre").value.trim();
        const email = document.getElementById("contactoEmail").value.trim();
        const emailConf = document.getElementById("contactoEmailConfirm").value.trim();

        if (nombre.length < 2) {
            return {
                ok: false,
                message: "⚠️ Por favor, introduzca su nombre y apellidos."
            };
        }
        if (!REGEX_EMAIL.test(email) || email.toLowerCase() !== emailConf.toLowerCase()) {
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
            const id = area.dataset.id;
            const resp = area.value.trim();
            const adjuntos = colaAdjuntosReq[id] || [];

            if (resp === "" && adjuntos.length === 0) {
                reqIncompletos = true;
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

    function findOversizedFile(fileLists) {
        const todos = [];
        fileLists.forEach((list) => {
            if (!list) return;
            if (Array.isArray(list)) todos.push(...list);
            else todos.push(...Object.values(list).flat());
        });
        return todos.find((f) => f.size > LIMITE_BYTES) || null;
    }

    function buildBasePayload(fields) {
        const cfg = global.EIEL_CONFIG;
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
                session_token: requireSessionToken()
            },
            fields.extra || {}
        );
    }

    /**
     * tasks: [{ file, seccion, tipo? }]
     * Sube en serie; reintenta si falla; si tras los reintentos sigue mal, aborta
     * el lote (no se debe llamar a generar PDF).
     * options.retries: por defecto 2 (el 3er intento duplicaba si Drive no indexaba a tiempo)
     * options.throwOnFail: por defecto true
     */
    async function uploadTaskList(tasks, idBatch, options) {
        options = options || {};
        const retries = options.retries != null ? options.retries : 2;
        const delayMs = options.delayMs != null ? options.delayMs : 800;
        const retryDelayMs = options.retryDelayMs != null ? options.retryDelayMs : 3500;
        const throwOnFail = options.throwOnFail !== false;
        const defaultTipo = options.defaultTipo;
        const totalTareas = tasks.length;
        let completados = 0;

        for (const tarea of tasks) {
            UIProgress.update(
                completados,
                totalTareas,
                "Subiendo archivos adjuntos (Subido " +
                    completados +
                    " de " +
                    totalTareas +
                    " archivos)..."
            );

            const tipo = tarea.tipo || defaultTipo;
            let lastError = null;
            let bestError = null;
            let exitoSubida = false;
            // Archivos grandes (fotos): más pausa entre intentos
            const sizeFactor = tarea.file && tarea.file.size > 2 * 1024 * 1024 ? 2 : 1;

            for (let intento = 1; intento <= retries; intento++) {
                try {
                    await UploadService.uploadFile(
                        tarea.file,
                        tipo,
                        global.EIEL_CONFIG.muniCode,
                        tarea.seccion,
                        idBatch
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
                    // Sesión inválida, tamaño, etc.: no reintentar (evita 404 HTML que tapa el mensaje).
                    if (isNonRetryableUploadError(e)) {
                        break;
                    }

                    // Tras 404 opaco: ¿ya quedó en Drive? (check ligero, sin reenviar la foto)
                    if (isOpaqueUploadError(e)) {
                        try {
                            await new Promise((r) => setTimeout(r, 1500));
                            const yaEsta = await UploadService.checkExists(
                                tarea.file.name,
                                tipo,
                                global.EIEL_CONFIG.muniCode,
                                tarea.seccion,
                                idBatch
                            );
                            if (yaEsta) {
                                console.warn(
                                    "[EIEL] Adjunto ya en Drive tras respuesta opaca:",
                                    tarea.file.name
                                );
                                exitoSubida = true;
                                break;
                            }
                        } catch (checkErr) {
                            console.warn("[EIEL] checkExists falló:", checkErr);
                        }
                    }

                    if (intento < retries) {
                        const wait =
                            retryDelayMs * sizeFactor * intento;
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
                    UIProgress.hide();
                    throw new Error(msg);
                }
                console.error(options.logPrefix || "Fallo en subida individual:", errFinal);
                continue;
            }

            completados++;
            // Pausa entre ficheros: más larga si el anterior era grande
            const pause =
                delayMs *
                (tarea.file && tarea.file.size > 2 * 1024 * 1024 ? 2 : 1);
            await new Promise((r) => setTimeout(r, pause));
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
    async function sendPdfPayload(payload) {
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
            throw new Error(detalle);
        }

        return true;
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
        findOversizedFile: findOversizedFile,
        buildBasePayload: buildBasePayload,
        uploadTaskList: uploadTaskList,
        sendPdfPayload: sendPdfPayload,
        resetFormAfterSuccess: resetFormAfterSuccess,
        newBatchId: newBatchId,
        buildReqUploadTasks: buildReqUploadTasks
    };
})(window);
