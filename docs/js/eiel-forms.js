/**
 * EIEL — lógica compartida de formularios
 * Fuente única para progreso, subidas, validaciones y utilidades de UI.
 * Debe cargarse después de definir window.EIEL_CONFIG (parcial) en base.html.
 */
(function (global) {
    "use strict";

    const LIMITE_BYTES = 35 * 1024 * 1024;
    const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function getIsTest() {
        return localStorage.getItem("eiel_is_test") === "true";
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

        async uploadFile(file, tipoFicha, muniCode, seccion, idEnvio) {
            try {
                const base64 = await this.toBase64(file);
                const userEmail =
                    (document.getElementById("contactoEmail") &&
                        document.getElementById("contactoEmail").value) ||
                    "anonimo";
                const payload = {
                    filename: file.name,
                    mimeType: file.type,
                    bytesBase64: base64,
                    municipio: muniCode,
                    usuario: userEmail,
                    tipo: tipoFicha,
                    seccion: seccion == null ? "DOCUMENTACION" : seccion,
                    id_envio: idEnvio
                };
                await fetch(global.EIEL_CONFIG.urlAdjuntos, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                return true;
            } catch (e) {
                console.error("Error subiendo:", e);
                return false;
            }
        }
    };

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
                    <i data-lucide="trash-2" style="width:18px;"></i>
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
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    if (markDirtyOnDrop) global.formSucio = true;
                    // Paridad: el drop histórico no filtraba 35 MB (sí el input y el submit).
                    archivos.push(...files);
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
            <div class="file-item" style="margin-bottom: 4px; padding: 4px 8px; background: #fdfdfd; border: 1px solid #e2e8f0; justify-content: space-between; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem;"><i data-lucide="paperclip" style="width:12px;"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon" style="padding: 2px; background: transparent; border: none; cursor: pointer;">
                    <i data-lucide="trash-2" style="width:16px; color: #ef4444;"></i>
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
            <div class="file-item" style="margin-bottom: 4px; padding: 4px 8px; background: #fdfdfd; border: 1px solid #e2e8f0; justify-content: space-between; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px;" title="${f.name}">
                    <i data-lucide="paperclip" style="width:12px; height:12px; color: #64748b;"></i> ${f.name}
                </span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon" style="padding: 2px; background: transparent; border: none; cursor: pointer;">
                    <i data-lucide="trash-2" style="width:16px; height:16px; color: #ef4444;"></i>
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
            <div class="file-item" style="margin-bottom:4px; padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span style="font-size: 0.75rem;"><i data-lucide="paperclip" style="width:12px;"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon">
                    <i data-lucide="trash-2" style="width:16px; color: #ef4444;"></i>
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
            <div class="file-item" style="margin-bottom:4px; padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size: 0.75rem;"><i data-lucide="paperclip" style="width:12px;"></i> ${f.name}</span>
                <button type="button" onclick="eliminarArchivoReq('${id}', ${i})" class="btn-danger-icon">
                    <i data-lucide="trash-2" style="width:16px; color: #ef4444;"></i>
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
                timestamp_envio: new Date().toISOString()
            },
            fields.extra || {}
        );
    }

    /**
     * tasks: [{ file, seccion, tipo? }]
     * Paridad con plantillas originales: se ignora el boolean de UploadService
     * (solo reintenta / falla si la promesa lanza).
     * options.retries: obras usa 2; resto 1.
     * options.throwOnFail: obras relanza error de archivo; resto solo loguea.
     */
    async function uploadTaskList(tasks, idBatch, options) {
        options = options || {};
        const retries = options.retries || 1;
        const delayMs = options.delayMs != null ? options.delayMs : 300;
        const retryDelayMs = options.retryDelayMs != null ? options.retryDelayMs : 1000;
        const throwOnFail = !!options.throwOnFail;
        const defaultTipo = options.defaultTipo;
        const totalTareas = tasks.length;
        let completados = 0;

        for (const tarea of tasks) {
            try {
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
                let exitoSubida = false;

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
                        if (intento === retries) {
                            if (throwOnFail) {
                                throw new Error(
                                    "No se pudo subir el archivo: " + tarea.file.name
                                );
                            }
                            throw e;
                        }
                        await new Promise((r) => setTimeout(r, retryDelayMs));
                    }
                }

                if (exitoSubida) {
                    completados++;
                    await new Promise((r) => setTimeout(r, delayMs));
                }
            } catch (e) {
                if (throwOnFail) throw e;
                console.error(options.logPrefix || "Fallo en subida individual:", e);
            }
        }

        return completados;
    }

    async function sendPdfPayload(payload) {
        await fetch(global.EIEL_CONFIG.urlGenerarPdf, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
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
        mergeConfig: mergeConfig,
        applyHeaderTheme: applyHeaderTheme,
        mostrarMensaje: mostrarMensaje,
        hideMensaje: hideMensaje,
        setupConformidad: setupConformidad,
        setupSelectHasValue: setupSelectHasValue,
        filterFilesBySize: filterFilesBySize,
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
