(function () {
    "use strict";

    // ── DOM refs ──
    const tabUpload = document.getElementById("tab-upload");
    const tabCamera = document.getElementById("tab-camera");
    const panelUpload = document.getElementById("panel-upload");
    const panelCamera = document.getElementById("panel-camera");

    const zone = document.getElementById("zone");
    const fileInput = document.getElementById("file");
    const preview = document.getElementById("preview");
    const uploadIcon = document.getElementById("upload-icon");
    const zoneText = document.getElementById("zone-text");
    const chooseBtn = document.getElementById("choose-btn");

    const cameraVideo = document.getElementById("camera-video");
    const cameraCanvas = document.getElementById("camera-canvas");
    const cameraPreview = document.getElementById("camera-preview");
    const btnStartCamera = document.getElementById("btn-start-camera");
    const btnCapture = document.getElementById("btn-capture");
    const btnRetake = document.getElementById("btn-retake");
    const cameraHint = document.getElementById("camera-hint");

    const analyzeBtn = document.getElementById("analyze");
    const loading = document.getElementById("loading");
    const errorDiv = document.getElementById("error");
    const resultsDiv = document.getElementById("results");
    const resultImg = document.getElementById("result-img");
    const metricsDiv = document.getElementById("metrics");
    const rawPre = document.getElementById("raw-output");
    const overlaySvg = document.getElementById("result-overlay");

    let selectedFile = null;
    let cameraStream = null;
    let regionsData = {};
    let imgW = 0;
    let imgH = 0;

    // ── Tabs ──
    function switchTab(tab) {
        tabUpload.classList.toggle("active", tab === "upload");
        tabCamera.classList.toggle("active", tab === "camera");
        panelUpload.classList.toggle("active", tab === "upload");
        panelCamera.classList.toggle("active", tab === "camera");
    }

    tabUpload.onclick = () => switchTab("upload");
    tabCamera.onclick = () => switchTab("camera");

    // ── File Upload ──
    zone.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add("dragover"); };
    zone.ondragleave = (e) => { e.preventDefault(); zone.classList.remove("dragover"); };
    zone.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files && files.length && files[0].type.startsWith("image/")) {
            selectedFile = files[0];
            showUploadPreview(selectedFile);
        }
    };

    fileInput.onchange = () => {
        selectedFile = fileInput.files[0] || null;
        showUploadPreview(selectedFile);
    };

    function showUploadPreview(file) {
        if (!file) {
            selectedFile = null;
            preview.style.display = "none";
            uploadIcon.style.display = "";
            zoneText.style.display = "";
            chooseBtn.textContent = "Choose Image";
            analyzeBtn.disabled = true;
            if (preview.src) URL.revokeObjectURL(preview.src);
            preview.removeAttribute("src");
            return;
        }
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
        uploadIcon.style.display = "none";
        zoneText.style.display = "none";
        chooseBtn.textContent = "Change Image";
        analyzeBtn.disabled = false;
        hideResults();
    }

    // ── Camera ──
    btnStartCamera.onclick = async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }
            });
            cameraVideo.srcObject = cameraStream;
            cameraVideo.style.display = "block";
            btnStartCamera.style.display = "none";
            btnCapture.style.display = "";
            cameraHint.textContent = "Position your face and click \"Take Photo\"";
            cameraPreview.style.display = "none";
            btnRetake.style.display = "none";
        } catch (err) {
            cameraHint.textContent = "Camera access denied or unavailable: " + err.message;
        }
    };

    btnCapture.onclick = () => {
        if (!cameraStream) return;
        const vw = cameraVideo.videoWidth;
        const vh = cameraVideo.videoHeight;
        cameraCanvas.width = vw;
        cameraCanvas.height = vh;
        const ctx = cameraCanvas.getContext("2d");
        ctx.drawImage(cameraVideo, 0, 0, vw, vh);

        cameraCanvas.toBlob((blob) => {
            if (!blob) return;
            selectedFile = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
            cameraPreview.src = URL.createObjectURL(blob);
            cameraPreview.style.display = "block";
            cameraVideo.style.display = "none";
            btnCapture.style.display = "none";
            btnRetake.style.display = "";
            cameraHint.textContent = "Photo captured. Click \"Analyze Skin\" to continue.";
            analyzeBtn.disabled = false;
            stopCamera();
            hideResults();
        }, "image/jpeg", 0.92);
    };

    btnRetake.onclick = () => {
        selectedFile = null;
        analyzeBtn.disabled = true;
        cameraPreview.style.display = "none";
        btnRetake.style.display = "none";
        btnStartCamera.style.display = "";
        cameraHint.textContent = "Click \"Start Camera\" to begin";
        hideResults();
    };

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach((t) => t.stop());
            cameraStream = null;
        }
    }

    // ── Analyze ──
    analyzeBtn.onclick = async () => {
        if (!selectedFile) {
            showError("Please select or capture an image first.");
            return;
        }

        analyzeBtn.disabled = true;
        loading.style.display = "flex";
        errorDiv.style.display = "none";
        resultsDiv.style.display = "none";

        const formData = new FormData();
        formData.append("image", selectedFile, selectedFile.name || "image.jpg");

        try {
            const res = await fetch("/analyze", { method: "POST", body: formData });
            let data;
            try { data = await res.json(); } catch (_) { data = {}; }

            if (!res.ok) {
                let msg = "Analysis failed";
                if (data.detail) {
                    if (typeof data.detail === "string") msg = data.detail;
                    else if (Array.isArray(data.detail) && data.detail.length)
                        msg = data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
                    else msg = JSON.stringify(data.detail);
                }
                throw new Error(msg);
            }

            renderResults(data);
        } catch (err) {
            showError(err instanceof Error ? err.message : String(err));
        } finally {
            loading.style.display = "none";
            analyzeBtn.disabled = false;
        }
    };

    // ── Render Results ──
    function renderResults(data) {
        resultImg.src = data.image_base64 || "";
        resultImg.alt = "Annotated analysis result";

        regionsData = data.regions || {};
        imgW = data.image_width || 0;
        imgH = data.image_height || 0;
        overlaySvg.setAttribute("viewBox", "0 0 " + imgW + " " + imgH);
        overlaySvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        clearHighlight();

        const allParams = flattenObj(data.metrics || {}, "");
        metricsDiv.innerHTML = allParams
            .map((p, i) => {
                const hl = p.region && regionsData[p.region] ? "highlightable" : "non-highlightable";
                const region = p.region || "";
                const explain = esc(getExplanation(p.fullKey));
                return (
                    '<div class="metric-item">' +
                    '<div class="metric-row" data-region="' + esc(region) + '">' +
                    '<span class="key ' + hl + '">' + esc(p.key) + "</span>" +
                    '<span class="val">' + esc(p.value) + "</span>" +
                    "</div>" +
                    '<div class="metric-arrow" data-idx="' + i + '" title="Learn more">&#9660;</div>' +
                    '<div class="metric-explain" data-idx="' + i + '">' + explain + "</div>" +
                    "</div>"
                );
            })
            .join("");

        metricsDiv.querySelectorAll(".metric-row").forEach((row) => {
            row.onclick = () => {
                metricsDiv.querySelectorAll(".metric-row").forEach((r) => r.classList.remove("active"));
                const region = row.dataset.region;
                if (region && regionsData[region]) {
                    row.classList.add("active");
                    drawHighlight(region);
                } else {
                    clearHighlight();
                }
            };
        });

        metricsDiv.querySelectorAll(".metric-arrow").forEach((arrow) => {
            arrow.onclick = (e) => {
                e.stopPropagation();
                const idx = arrow.dataset.idx;
                const explain = metricsDiv.querySelector('.metric-explain[data-idx="' + idx + '"]');
                const isOpen = explain.classList.contains("show");
                metricsDiv.querySelectorAll(".metric-explain").forEach((el) => el.classList.remove("show"));
                metricsDiv.querySelectorAll(".metric-arrow").forEach((el) => el.classList.remove("expanded"));
                if (!isOpen) {
                    explain.classList.add("show");
                    arrow.classList.add("expanded");
                }
            };
        });

        rawPre.textContent = JSON.stringify(data, null, 2).slice(0, 8000);
        resultsDiv.style.display = "block";
        resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ── SVG Overlay Highlighting ──
    const REGION_COLORS = {
        face:        { fill: "rgba(0,229,255,0.25)", stroke: "#00e5ff" },
        dark_circle: { fill: "rgba(171,71,188,0.30)", stroke: "#ab47bc" },
        brown_spot:  { fill: "rgba(141,110,99,0.30)", stroke: "#8d6e63" },
        blackhead:   { fill: "rgba(255,238,88,0.30)", stroke: "#ffee58" },
        acne:        { fill: "rgba(239,83,80,0.30)",  stroke: "#ef5350" },
        acne_mark:   { fill: "rgba(239,83,80,0.30)",  stroke: "#ef5350" },
    };

    function drawHighlight(regionKey) {
        overlaySvg.innerHTML = "";
        const keys = regionKey === "acne" ? ["acne", "acne_mark"] : [regionKey];
        let rects = [];
        for (const k of keys) {
            if (regionsData[k]) rects = rects.concat(regionsData[k]);
        }
        if (!rects.length) return;

        const colors = REGION_COLORS[regionKey] || REGION_COLORS.face;
        for (const r of rects) {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", r.left);
            rect.setAttribute("y", r.top);
            rect.setAttribute("width", r.width);
            rect.setAttribute("height", r.height);
            rect.setAttribute("fill", colors.fill);
            rect.setAttribute("stroke", colors.stroke);
            rect.setAttribute("stroke-width", "2");
            rect.setAttribute("rx", "3");
            overlaySvg.appendChild(rect);
        }
    }

    function clearHighlight() {
        overlaySvg.innerHTML = "";
    }

    // ── Helpers ──
    function hideResults() {
        errorDiv.style.display = "none";
        resultsDiv.style.display = "none";
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
    }

    function esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function formatVal(v) {
        if (v === null || v === undefined) return "-";
        if (typeof v === "boolean") return String(v);
        if (typeof v === "number") return v % 1 === 0 ? String(v) : String(Math.round(v * 100) / 100);
        if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "..." : v;
        if (Array.isArray(v)) {
            if (v.length === 0) return "[]";
            if (v.length <= 4 && v.every((x) => typeof x !== "object" || x === null)) return JSON.stringify(v);
            if (v.length > 8) return "[" + v.length + " items]";
            return JSON.stringify(v.slice(0, 4)) + (v.length > 4 ? "..." : "");
        }
        if (typeof v === "object") return "{...}";
        return String(v);
    }

    function keyToRegion(key) {
        const k = key.toLowerCase().replace(/\s/g, "_");
        if (k.includes("face_rectangle") || k.includes("face.rectangle")) return "face";
        if (k.includes("dark_circle_mark") || k.includes("dark.circle.mark")) return "dark_circle";
        if (k.includes("brown_spot") || k.includes("brown.spot")) return "brown_spot";
        if (k.includes("closed_comedones") || k.includes("closed.comedones")) return "blackhead";
        if (k.includes("acne_mark") || k.includes("acne.mark")) return "acne_mark";
        if (k.includes("acne") && !k.includes("acne_mark")) return "acne";
        return "";
    }

    const EXPLANATIONS = {
        face_rectangle: "The bounding box around the detected face.",
        skin_age: "Estimated skin age based on wrinkles, texture, and pigmentation.",
        score_info: "Overall and category-specific scores (0-100). Higher is better.",
        total_score: "Combined skin health score across all dimensions.",
        wrinkle: "Wrinkle severity: forehead lines, crow's feet, fine lines, nasolabial folds.",
        pores: "Pore visibility and enlargement score.",
        blackhead: "Blackhead (open comedones) severity.",
        acne: "Active acne severity: papules, pustules, nodules.",
        acne_mark: "Post-inflammatory hyperpigmentation from healed acne.",
        dark_circle: "Dark circles under the eyes.",
        brown_spot: "Brown spots (sun spots, age spots).",
        closed_comedones: "Closed comedones (whiteheads).",
        skin_type: "Oily, Dry, Normal, or Combination.",
        skin_tone: "Skin color classification.",
        skin_undertone: "Underlying warm, cool, or neutral tone.",
        sensitivity: "Skin sensitivity level and affected areas.",
        eye_bag: "Puffiness or bags under the eyes.",
        pigmentation: "Overall skin pigmentation level.",
        mole: "Detected moles: location and count.",
        glabellar: "Lines between the eyebrows (frown lines).",
        nasolabial: "Nasolabial folds: lines from nose to mouth corners.",
        forehead: "Forehead wrinkles or lines.",
        crow: "Crow's feet: fine lines around the outer eye corners.",
        fine_line: "Fine lines, often under eyes or on forehead.",
        texture: "Skin texture: smoothness, roughness, or unevenness.",
        oil: "Oiliness level.",
        moisture: "Skin moisture or hydration level.",
        left_eye_rect: "Left eye region for dark circle analysis.",
        right_eye_rect: "Right eye region for dark circle analysis.",
        rectangle: "Bounding box coordinates of detected region.",
        left: "Left coordinate (X) of the bounding box.",
        top: "Top coordinate (Y) of the bounding box.",
        width: "Width of the detected region in pixels.",
        height: "Height of the detected region in pixels.",
        count: "Number of detected items.",
        value: "Numeric value for this parameter.",
        severity: "Severity level (mild, moderate, severe).",
        error_code: "API response code. 0 means success.",
        request_id: "Unique request identifier.",
    };

    function getExplanation(fullKey) {
        const k = fullKey.toLowerCase().replace(/\s/g, "_");
        for (const [pattern, explanation] of Object.entries(EXPLANATIONS)) {
            if (k.includes(pattern)) return explanation;
        }
        return "Part of the skin analysis result.";
    }

    function flattenObj(obj, prefix) {
        const out = [];
        if (!obj || typeof obj !== "object") return out;
        for (const k of Object.keys(obj).sort()) {
            const fullKey = prefix ? prefix + "." + k : k;
            const v = obj[k];
            if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                out.push(...flattenObj(v, fullKey));
            } else {
                const displayKey = fullKey
                    .replace(/_/g, " ")
                    .replace(/\./g, " > ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                out.push({ key: displayKey, value: formatVal(v), region: keyToRegion(fullKey), fullKey: fullKey });
            }
        }
        return out;
    }
})();
