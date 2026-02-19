(function () {
    "use strict";

    // ── Page Navigation ──
    const navBtns = document.querySelectorAll(".page-nav-btn");
    const pages = document.querySelectorAll(".page");

    navBtns.forEach((btn) => {
        btn.onclick = () => {
            const targetId = btn.dataset.page;
            navBtns.forEach((b) => b.classList.remove("active"));
            pages.forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(targetId).classList.add("active");
            if (targetId === "page-compare") loadHistory();
        };
    });

    // ══════════════════════════════════════════════════
    //  ANALYZE PAGE
    // ══════════════════════════════════════════════════

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
    let originalImgSrc = "";

    function fileToDataUrl(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function (e) { resolve(e.target.result); };
            reader.readAsDataURL(file);
        });
    }

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

        originalImgSrc = await fileToDataUrl(selectedFile);

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

        var dialsContainer = document.getElementById("analysis-dials");
        if (dialsContainer) {
            dialsContainer.innerHTML = "";
            var dialItems = extractDialMetrics(data.metrics || {});
            if (dialItems.length > 0) {
                var dHtml = '<div class="dial-grid">';
                dialItems.forEach(function (d) {
                    dHtml += buildSingleDial(d.label, d.value, d.key, d.direction);
                });
                dHtml += "</div>";
                dialsContainer.innerHTML = dHtml;
            }
        }

        buildConditionTabs(data);

        resultsDiv.style.display = "block";
        resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    var SINGLE_DIAL_MAP = [
        { path: "result.score_info.total_score",            label: "Total Score",          dir: "higher_is_better" },
        { path: "result.score_info.wrinkle_score",          label: "Wrinkle Score",        dir: "higher_is_better" },
        { path: "result.score_info.pores_score",            label: "Pores Score",          dir: "higher_is_better" },
        { path: "result.score_info.blackhead_score",        label: "Blackhead Score",      dir: "higher_is_better" },
        { path: "result.score_info.acne_score",             label: "Acne Score",           dir: "higher_is_better" },
        { path: "result.score_info.dark_circle_score",      label: "Dark Circle Score",    dir: "higher_is_better" },
        { path: "result.score_info.sensitivity_score",      label: "Sensitivity Score",    dir: "higher_is_better" },
        { path: "result.score_info.brown_spot_score",       label: "Brown Spot Score",     dir: "higher_is_better" },
        { path: "result.score_info.closed_comedones_score", label: "Comedones Score",      dir: "higher_is_better" },
        { path: "result.score_info.eye_bag_score",          label: "Eye Bag Score",        dir: "higher_is_better" },
        { path: "result.score_info.pigmentation_score",     label: "Pigmentation Score",   dir: "higher_is_better" },
        { path: "result.score_info.mole_score",             label: "Mole Score",           dir: "higher_is_better" },
        { path: "result.score_info.texture_score",          label: "Texture Score",        dir: "higher_is_better" },
        { path: "result.score_info.oil_score",              label: "Oil Score",            dir: "higher_is_better" },
        { path: "result.score_info.moisture_score",         label: "Moisture Score",       dir: "higher_is_better" },
        { path: "result.skin_age",                          label: "Skin Age",             dir: "lower_is_better" },
        { path: "result.acne.count",                        label: "Acne Count",           dir: "lower_is_better" },
        { path: "result.blackhead.count",                   label: "Blackhead Count",      dir: "lower_is_better" },
        { path: "result.blackhead.severity",                label: "Blackhead Severity",   dir: "lower_is_better" },
        { path: "result.eye_bag.severity",                  label: "Eye Bag Severity",     dir: "lower_is_better" },
        { path: "result.forehead_wrinkle.severity",         label: "Forehead Wrinkle",     dir: "lower_is_better" },
        { path: "result.glabellar_wrinkle.severity",        label: "Glabellar Wrinkle",    dir: "lower_is_better" },
    ];

    function extractDialMetrics(metrics) {
        var items = [];
        SINGLE_DIAL_MAP.forEach(function (entry) {
            var parts = entry.path.split(".");
            var val = metrics;
            for (var i = 0; i < parts.length && val != null; i++) {
                val = val[parts[i]];
            }
            if (typeof val === "number") {
                items.push({ label: entry.label, value: val, key: entry.path, direction: entry.dir });
            }
        });
        return items;
    }

    // ══════════════════════════════════════════════════
    //  ENHANCED RECTANGLE HELPERS
    // ══════════════════════════════════════════════════

    var RECT_PAD = 18;
    var RECT_STROKE_W = 4;
    var BRACKET_W = 5.5;
    var BRACKET_LEN_RATIO = 0.28;
    var BRACKET_MAX = 22;

    function buildEnhancedRectSvg(rects, color, iw, ih, filterId) {
        if (!rects.length) return { defs: "", body: "" };

        var defs = '<filter id="' + filterId + '" x="-50%" y="-50%" width="200%" height="200%">' +
            '<feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>' +
            '<feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0" result="glow"/>' +
            '<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>' +
            '</filter>';

        var body = "";

        rects.forEach(function (r, i) {
            var x = Math.max(0, r.left - RECT_PAD);
            var y = Math.max(0, r.top - RECT_PAD);
            var w = r.width + RECT_PAD * 2;
            var h = r.height + RECT_PAD * 2;
            if (iw > 0 && x + w > iw) w = iw - x;
            if (ih > 0 && y + h > ih) h = ih - y;

            var fillOpacity = color.fill.replace(/[\d.]+\)$/, "0.32)");

            body += '<rect x="' + x + '" y="' + y +
                '" width="' + w + '" height="' + h +
                '" fill="' + fillOpacity + '" stroke="' + color.stroke +
                '" stroke-width="' + RECT_STROKE_W + '" rx="6" class="region-rect" filter="url(#' + filterId + ')"/>';

            var bLen = Math.min(w * BRACKET_LEN_RATIO, h * BRACKET_LEN_RATIO, BRACKET_MAX);
            var bc = color.stroke;

            body += '<path d="M' + (x + bLen) + ',' + y + ' L' + x + ',' + y + ' L' + x + ',' + (y + bLen) +
                '" fill="none" stroke="' + bc + '" stroke-width="' + BRACKET_W + '" stroke-linecap="round"/>';
            body += '<path d="M' + (x + w - bLen) + ',' + y + ' L' + (x + w) + ',' + y + ' L' + (x + w) + ',' + (y + bLen) +
                '" fill="none" stroke="' + bc + '" stroke-width="' + BRACKET_W + '" stroke-linecap="round"/>';
            body += '<path d="M' + x + ',' + (y + h - bLen) + ' L' + x + ',' + (y + h) + ' L' + (x + bLen) + ',' + (y + h) +
                '" fill="none" stroke="' + bc + '" stroke-width="' + BRACKET_W + '" stroke-linecap="round"/>';
            body += '<path d="M' + (x + w) + ',' + (y + h - bLen) + ' L' + (x + w) + ',' + (y + h) + ' L' + (x + w - bLen) + ',' + (y + h) +
                '" fill="none" stroke="' + bc + '" stroke-width="' + BRACKET_W + '" stroke-linecap="round"/>';
        });

        return { defs: defs, body: body };
    }

    function buildEnhancedRectDom(overlaySvg, rects, color, filterId) {
        if (!rects.length) return;

        var ns = "http://www.w3.org/2000/svg";
        var defs = overlaySvg.querySelector("defs") || document.createElementNS(ns, "defs");
        if (!defs.parentNode) overlaySvg.appendChild(defs);

        var filter = document.createElementNS(ns, "filter");
        filter.setAttribute("id", filterId);
        filter.setAttribute("x", "-50%");
        filter.setAttribute("y", "-50%");
        filter.setAttribute("width", "200%");
        filter.setAttribute("height", "200%");
        var blur = document.createElementNS(ns, "feGaussianBlur");
        blur.setAttribute("in", "SourceGraphic");
        blur.setAttribute("stdDeviation", "8");
        blur.setAttribute("result", "blur");
        filter.appendChild(blur);
        var cm = document.createElementNS(ns, "feColorMatrix");
        cm.setAttribute("in", "blur");
        cm.setAttribute("type", "matrix");
        cm.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0");
        cm.setAttribute("result", "glow");
        filter.appendChild(cm);
        var merge = document.createElementNS(ns, "feMerge");
        var mn1 = document.createElementNS(ns, "feMergeNode");
        mn1.setAttribute("in", "glow");
        merge.appendChild(mn1);
        var mn2 = document.createElementNS(ns, "feMergeNode");
        mn2.setAttribute("in", "SourceGraphic");
        merge.appendChild(mn2);
        filter.appendChild(merge);
        defs.appendChild(filter);

        var iw = parseInt(overlaySvg.getAttribute("viewBox").split(" ")[2]) || 0;
        var ih = parseInt(overlaySvg.getAttribute("viewBox").split(" ")[3]) || 0;

        rects.forEach(function (r) {
            var x = Math.max(0, r.left - RECT_PAD);
            var y = Math.max(0, r.top - RECT_PAD);
            var w = r.width + RECT_PAD * 2;
            var h = r.height + RECT_PAD * 2;
            if (iw > 0 && x + w > iw) w = iw - x;
            if (ih > 0 && y + h > ih) h = ih - y;

            var fillOpacity = color.fill.replace(/[\d.]+\)$/, "0.32)");

            var rect = document.createElementNS(ns, "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", w);
            rect.setAttribute("height", h);
            rect.setAttribute("fill", fillOpacity);
            rect.setAttribute("stroke", color.stroke);
            rect.setAttribute("stroke-width", RECT_STROKE_W);
            rect.setAttribute("rx", "6");
            rect.setAttribute("class", "region-rect");
            rect.setAttribute("filter", "url(#" + filterId + ")");
            overlaySvg.appendChild(rect);

            var bLen = Math.min(w * BRACKET_LEN_RATIO, h * BRACKET_LEN_RATIO, BRACKET_MAX);
            function mkPath(d) {
                var p = document.createElementNS(ns, "path");
                p.setAttribute("d", d);
                p.setAttribute("fill", "none");
                p.setAttribute("stroke", color.stroke);
                p.setAttribute("stroke-width", BRACKET_W);
                p.setAttribute("stroke-linecap", "round");
                overlaySvg.appendChild(p);
            }
            mkPath("M" + (x + bLen) + "," + y + " L" + x + "," + y + " L" + x + "," + (y + bLen));
            mkPath("M" + (x + w - bLen) + "," + y + " L" + (x + w) + "," + y + " L" + (x + w) + "," + (y + bLen));
            mkPath("M" + x + "," + (y + h - bLen) + " L" + x + "," + (y + h) + " L" + (x + bLen) + "," + (y + h));
            mkPath("M" + (x + w) + "," + (y + h - bLen) + " L" + (x + w) + "," + (y + h) + " L" + (x + w - bLen) + "," + (y + h));
        });
    }

    // ══════════════════════════════════════════════════
    //  CONDITION TABS (multi-dial, corrected API paths)
    // ══════════════════════════════════════════════════

    var CONDITION_TABS = [
        { id: "acne", name: "Acne",
          desc: "Acne is caused by clogged hair follicles with oil and dead cells. Deduction per lesion: comedone \u22121.7, papule \u22122.4, pustule \u22124.8, nodule \u22129.8 points. Ratings: 90\u2013100 None, 70\u201389 Mild, 50\u201369 Moderate, 30\u201349 Severe.",
          regions: ["acne", "acne_mark", "acne_nodule", "acne_pustule"],
          dials: [{ path: "result.score_info.acne_score", label: "Acne Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(239,83,80,0.35)", stroke: "#ef5350" } },

        { id: "wrinkles", name: "Wrinkles",
          desc: "Wrinkles form from repeated facial expressions and loss of elasticity. Covers forehead lines, crow\u2019s feet, nasolabial folds, glabellar frown lines, and under-eye fine lines. Ratings: 90\u2013100 None, 70\u201389 Mild, 50\u201369 Moderate, 30\u201349 Severe.",
          regions: ["face"],
          dials: [{ path: "result.score_info.wrinkle_score", label: "Wrinkle Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(100,181,246,0.35)", stroke: "#64b5f6" } },

        { id: "pores", name: "Pores",
          desc: "Enlarged pores from excess oil, reduced elasticity, and clogged follicles. Measured across forehead, left cheek, right cheek, and jaw. Total is the average of all four sub-scores. Ratings: 90\u2013100 None, 70\u201389 Mild, 50\u201369 Moderate, 30\u201349 Severe.",
          regions: ["face"],
          dials: [
              { path: "result.score_info.pores_score", label: "Overall Pores", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.pores_type_score.pores_forehead_score", label: "Forehead", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.pores_type_score.pores_leftcheek_score", label: "Left Cheek", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.pores_type_score.pores_rightcheek_score", label: "Right Cheek", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.pores_type_score.pores_jaw_score", label: "Jaw", dir: "higher_is_better", scale: "score" }
          ],
          color: { fill: "rgba(129,199,132,0.35)", stroke: "#81c784" } },

        { id: "blackheads", name: "Blackheads",
          desc: "Blackheads (open comedones) form when pores clog with sebum and oxidize. Each blackhead deducts ~0.3 points. Count 0\u201330: None, 31\u2013100: Mild, 101\u2013160: Moderate, 161+: Severe.",
          regions: ["blackhead"],
          dials: [{ path: "result.score_info.blackhead_score", label: "Blackhead Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(255,238,88,0.35)", stroke: "#ffee58" } },

        { id: "dark_circles", name: "Dark Circles",
          desc: "Dark circles can be pigmented, vascular, or structural. Severity deduction by type \u2014 Pigmented: 0/7/11/16, Vascular: 0/9/15/20, Structural: 0/11/19/28. Left and right eyes scored individually then combined. Ratings: 90\u2013100 None, 70\u201389 Mild, 50\u201369 Moderate, 30\u201349 Severe.",
          regions: ["dark_circle"],
          dials: [
              { path: "result.score_info.dark_circle_score", label: "Overall Score", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.dark_circle_type_score.left_dark_circle_score", label: "Left Eye Score", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.dark_circle_type_score.right_dark_circle_score", label: "Right Eye Score", dir: "higher_is_better", scale: "score" },
              { path: "result.dark_circle_severity.value", label: "Overall Severity", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_dark_circle_pigment.value", label: "Pigment (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_dark_circle_pigment.value", label: "Pigment (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_dark_circle_rete.value", label: "Vascular (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_dark_circle_rete.value", label: "Vascular (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_dark_circle_structural.value", label: "Structural (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_dark_circle_structural.value", label: "Structural (R)", dir: "lower_is_better", scale: "severity" }
          ],
          color: { fill: "rgba(171,71,188,0.35)", stroke: "#ab47bc" } },

        { id: "brown_spots", name: "Brown Spots",
          desc: "Sun spots, age spots, and melasma from excess melanin. Brown spots are areas of hyperpigmentation caused by UV exposure, aging, or hormonal changes. The melanin score reflects overall pigmentation health. Concentration 0\u20130.09%: None, 0.10\u20130.30%: Mild, 0.31\u20130.60%: Moderate, 0.61%+: Severe.",
          regions: ["brown_spot"],
          dials: [
              { path: "result.score_info.melanin_score", label: "Melanin Score", dir: "higher_is_better", scale: "score" },
              { path: "result.brown_spot.count", label: "Spots Detected", dir: "lower_is_better", scale: "count_spots" },
              { path: "result.melasma.value", label: "Melasma", dir: "lower_is_better", scale: "severity" },
              { path: "result.freckle.value", label: "Freckle", dir: "lower_is_better", scale: "severity" }
          ],
          color: { fill: "rgba(141,110,99,0.35)", stroke: "#8d6e63" } },

        { id: "moles", name: "Moles",
          desc: "Moles (nevi) are benign growths of melanocytes. While usually harmless, changes in size, shape, or color should be monitored. The API detects and counts visible moles, providing their locations on the face.",
          regions: ["mole"],
          dials: [
              { path: "result.mole.count", label: "Moles Detected", dir: "lower_is_better", scale: "count_spots" }
          ],
          color: { fill: "rgba(121,85,72,0.35)", stroke: "#795548" } },

        { id: "sensitivity", name: "Sensitivity",
          desc: "Skin sensitivity indicates reactivity to environmental factors. Measured by affected area and redness. Area 0\u20130.09%: None, 0.10\u20130.30%: Mild, 0.31\u20130.60%: Moderate, 0.61%+: Severe.",
          regions: ["face"],
          dials: [
              { path: "result.score_info.sensitivity_score", label: "Sensitivity Score", dir: "higher_is_better", scale: "score" },
              { path: "result.score_info.red_spot_score", label: "Red Spot Score", dir: "higher_is_better", scale: "score" }
          ],
          color: { fill: "rgba(244,143,177,0.35)", stroke: "#f48fb1" } },

        { id: "eye_bags", name: "Eye Bags",
          desc: "Puffiness from weakened tissue structures around eyelids. Fat shifts into lower lids. Severity: 0 = None, 1 = Mild, 2 = Moderate, 3 = Severe.",
          regions: ["eye_pouch"],
          dials: [{ path: "result.eye_pouch_severity.value", label: "Eye Bag Severity", dir: "lower_is_better", scale: "severity" }],
          color: { fill: "rgba(149,117,205,0.35)", stroke: "#9575cd" } },

        { id: "skin_quality", name: "Skin Quality",
          desc: "Skin quality score reflects skin type balance. Formula: 100 \u2212 (water_score + oily_intensity_score) / 2. Lower = healthier. 1\u201315: Neutral (best), 16\u201340: Dry, 41\u201360: Combination, 61\u2013100: Oily.",
          regions: ["face"],
          dials: [{ path: "result.score_info.skin_type_score", label: "Skin Quality", dir: "lower_is_better", scale: "skin_type" }],
          color: { fill: "rgba(100,200,200,0.35)", stroke: "#64c8c8" } },

        { id: "melanin", name: "Melanin / Pigmentation",
          desc: "Melanin concentration reflects pigmentation levels. Formula: 100 \u2212 melanin_concentration. Brown area 0\u20130.09%: None, 0.10\u20130.30%: Mild, 0.31\u20130.60%: Moderate, 0.61%+: Severe.",
          regions: ["brown_spot", "mole"],
          dials: [
              { path: "result.score_info.melanin_score", label: "Melanin Score", dir: "higher_is_better", scale: "score" },
              { path: "result.brown_spot.count", label: "Brown Spots", dir: "lower_is_better", scale: "count_spots" },
              { path: "result.mole.count", label: "Moles", dir: "lower_is_better", scale: "count_spots" }
          ],
          color: { fill: "rgba(161,136,127,0.35)", stroke: "#a1887f" } },

        { id: "roughness", name: "Roughness",
          desc: "Skin roughness reflects surface smoothness. Formula: 100 \u2212 rough_severity. Rough area 0\u20130.06%: Smooth, 0.07\u20130.20%: Mild, 0.21\u20130.50%: Moderate, 0.51%+: Severe.",
          regions: ["face"],
          dials: [{ path: "result.score_info.rough_score", label: "Roughness Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(77,208,225,0.35)", stroke: "#4dd0e1" } },

        { id: "moisture", name: "Moisture",
          desc: "Skin moisture indicates hydration levels. Formula: 100 \u2212 water_severity. Water area 0\u20130.09%: Hydrated, 0.10\u20130.30%: Mild Dehydration, 0.31\u20130.60%: Moderate, 0.61%+: Severe.",
          regions: ["face"],
          dials: [{ path: "result.score_info.water_score", label: "Moisture Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(77,182,172,0.35)", stroke: "#4db6ac" } },

        { id: "oiliness", name: "Oiliness",
          desc: "Oiliness measures excess sebum production. High oil leads to enlarged pores, acne, and shine. Ratings: 90\u2013100 None, 70\u201389 Mild, 50\u201369 Moderate, 30\u201349 Severe.",
          regions: ["face"],
          dials: [{ path: "result.score_info.oily_intensity_score", label: "Oiliness Score", dir: "higher_is_better", scale: "score" }],
          color: { fill: "rgba(255,183,77,0.35)", stroke: "#ffb74d" } },

        { id: "severity_levels", name: "Severity Levels",
          desc: "Severity values (0\u20133 scale) across all detected conditions. 0 = None, 1 = Mild, 2 = Moderate, 3 = Severe. Lower is better.",
          regions: ["face", "dark_circle", "eye_pouch"],
          dials: [
              { path: "result.eye_pouch_severity.value", label: "Eye Pouch", dir: "lower_is_better", scale: "severity" },
              { path: "result.dark_circle_severity.value", label: "Dark Circle", dir: "lower_is_better", scale: "severity" },
              { path: "result.forehead_wrinkle_severity.value", label: "Forehead Wrinkle", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_nasolabial_fold_severity.value", label: "Nasolabial (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_nasolabial_fold_severity.value", label: "Nasolabial (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_crows_feet_severity.value", label: "Crow's Feet (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_crows_feet_severity.value", label: "Crow's Feet (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_eye_finelines_severity.value", label: "Fine Lines (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_eye_finelines_severity.value", label: "Fine Lines (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.glabella_wrinkle_severity.value", label: "Glabellar", dir: "lower_is_better", scale: "severity" },
              { path: "result.pores_forehead.value", label: "Pore Forehead", dir: "lower_is_better", scale: "severity" },
              { path: "result.pores_left_cheek.value", label: "Pore L.Cheek", dir: "lower_is_better", scale: "severity" },
              { path: "result.pores_right_cheek.value", label: "Pore R.Cheek", dir: "lower_is_better", scale: "severity" },
              { path: "result.pores_jaw.value", label: "Pore Jaw", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_mouth_wrinkle_severity.value", label: "Mouth (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_mouth_wrinkle_severity.value", label: "Mouth (R)", dir: "lower_is_better", scale: "severity" },
              { path: "result.left_cheek_wrinkle_severity.value", label: "Cheek (L)", dir: "lower_is_better", scale: "severity" },
              { path: "result.right_cheek_wrinkle_severity.value", label: "Cheek (R)", dir: "lower_is_better", scale: "severity" }
          ],
          color: { fill: "rgba(200,200,200,0.2)", stroke: "#aaa" } },

        { id: "summary", name: "Summary",
          desc: "For ALL scores (except skin_type_score): Higher = Better skin condition. 90\u2013100 = Excellent / None, 70\u201389 = Mild issues, 50\u201369 = Moderate issues, 30\u201349 = Severe issues.\n\nFor skin_type_score: Lower = healthier (neutral skin). For severity values (0\u20133): Lower = better. For counts (acne, blackheads, pores): Lower = better (fewer issues).",
          regions: ["face"],
          dials: [
              { path: "result.score_info.total_score", label: "Total Score", dir: "higher_is_better", scale: "score" },
              { path: "result.skin_age.value", label: "Skin Age", dir: "lower_is_better", scale: "age" }
          ],
          color: { fill: "rgba(74,144,217,0.2)", stroke: "#4a90d9" } }
    ];

    function getNestedVal(obj, path) {
        var parts = path.split(".");
        var v = obj;
        for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
        return v;
    }

    function buildConditionTabs(data) {
        var tabBar = document.getElementById("condition-tab-bar");
        var panels = document.getElementById("condition-panels");

        panels.querySelectorAll(".condition-panel-dynamic").forEach(function (el) { el.remove(); });

        var tabHtml = '<button class="condition-tab active" data-cpanel="cpanel-overview">Overview</button>';
        var activeTabs = [];
        CONDITION_TABS.forEach(function (tab) {
            var hasData = tab.dials.some(function (d) {
                return typeof getNestedVal(data.metrics || {}, d.path) === "number";
            });
            if (!hasData) return;
            activeTabs.push(tab);
            tabHtml += '<button class="condition-tab" data-cpanel="cpanel-' + tab.id + '">' + esc(tab.name) + "</button>";
        });
        tabBar.innerHTML = tabHtml;

        var origImg = originalImgSrc || data.image_base64 || "";
        var regions = data.regions || {};
        var iw = data.image_width || 0;
        var ih = data.image_height || 0;

        activeTabs.forEach(function (tab) {
            var panel = document.createElement("div");
            panel.className = "condition-panel condition-panel-dynamic";
            panel.id = "cpanel-" + tab.id;
            panel.dataset.imgLoaded = "false";

            var rects = [];
            tab.regions.forEach(function (rk) {
                if (regions[rk]) rects = rects.concat(regions[rk]);
            });

            var fid = "rglow-" + tab.id;
            var enhanced = buildEnhancedRectSvg(rects, tab.color, iw, ih, fid);

            var dialsHtml = "";
            var dialCount = 0;
            tab.dials.forEach(function (d) {
                var v = getNestedVal(data.metrics || {}, d.path);
                if (typeof v !== "number") return;
                dialCount++;
                var cfg = getDialConfig(d.path, d.dir, v, 0, d.scale);
                var lbl = v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
                dialsHtml += '<div class="cg-mini-dial">' +
                    '<div class="cg-mini-label">' + esc(d.label) + "</div>" +
                    buildGlassDial(cfg, [{ val: v, color: "rgba(74,144,217,0.95)", glow: true }], lbl) +
                    "</div>";
            });

            var detBadge = rects.length > 0
                ? '<div class="cg-badge">' + rects.length + " region" + (rects.length > 1 ? "s" : "") + " detected</div>"
                : '<div class="cg-badge cg-badge-clear">No affected regions detected</div>';

            var overlayHtml = (iw > 0 && ih > 0 && rects.length > 0)
                ? '<svg class="cg-overlay" viewBox="0 0 ' + iw + " " + ih + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs>' + enhanced.defs + '</defs>' + enhanced.body + "</svg>"
                : "";

            var noRegionMsg = rects.length === 0
                ? '<div class="cg-no-regions">No visual markers for this condition</div>'
                : "";

            var multiClass = dialCount > 1 ? " cg-multi-dials" : "";

            panel.innerHTML =
                '<div class="condition-grid">' +
                '<div class="cg-cell cg-info glass-card">' +
                    '<div class="cg-cell-inner">' +
                    '<h3 class="cg-name">' + esc(tab.name) + "</h3>" +
                    '<div class="cg-desc">' + tab.desc.replace(/\n/g, "<br>") + "</div>" +
                    detBadge +
                    "</div>" +
                "</div>" +
                '<div class="cg-cell cg-video glass-card">' +
                    '<div class="cg-cell-inner video-placeholder">' +
                    '<svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">' +
                    '<rect x="2" y="4" width="15" height="16" rx="2"/>' +
                    '<path d="M17 9l5-3v12l-5-3z"/>' +
                    "</svg>" +
                    '<span class="vp-text">Video Coming Soon</span>' +
                    "</div>" +
                "</div>" +
                '<div class="cg-cell cg-image glass-card">' +
                    '<div class="cg-cell-inner">' +
                    '<div class="cg-img-wrap">' +
                    '<img class="cg-face-img" alt="' + esc(tab.name) + ' regions">' +
                    overlayHtml +
                    "</div>" +
                    noRegionMsg +
                    "</div>" +
                "</div>" +
                '<div class="cg-cell cg-dial glass-card">' +
                    '<div class="cg-cell-inner cg-dial-inner">' +
                    '<div class="' + multiClass + '">' + dialsHtml + "</div>" +
                    "</div>" +
                "</div>" +
                "</div>";

            panels.appendChild(panel);
        });

        tabBar.querySelectorAll(".condition-tab").forEach(function (btn) {
            btn.onclick = function () {
                tabBar.querySelectorAll(".condition-tab").forEach(function (b) { b.classList.remove("active"); });
                panels.querySelectorAll(".condition-panel").forEach(function (p) { p.classList.remove("active"); });
                btn.classList.add("active");
                var target = document.getElementById(btn.dataset.cpanel);
                if (target) {
                    target.classList.add("active");
                    if (target.dataset.imgLoaded === "false") {
                        var img = target.querySelector(".cg-face-img");
                        if (img) img.src = origImg;
                        target.dataset.imgLoaded = "true";
                    }
                }
            };
        });
    }

    // ══════════════════════════════════════════════════
    //  COMPARISON CONDITION TABS
    // ══════════════════════════════════════════════════

    var BEFORE_COLOR = "rgba(45,142,224,0.95)";
    var AFTER_COLOR  = "rgba(168,85,247,0.95)";

    function isImproved(dir, bv, av) {
        if (dir === "higher_is_better") return av > bv;
        if (dir === "lower_is_better") return av < bv;
        return av !== bv;
    }

    function buildCompareConditionTabs(compData, bFull, aFull) {
        var tabBar = document.getElementById("comp-tab-bar");
        var panels = document.getElementById("comp-panels");
        if (!tabBar || !panels) return;

        panels.querySelectorAll(".comp-panel-dynamic").forEach(function (el) { el.remove(); });

        var bMetrics = (bFull && bFull.metrics) || {};
        var aMetrics = (aFull && aFull.metrics) || {};
        var bRegions = (bFull && bFull.regions) || {};
        var aRegions = (aFull && aFull.regions) || {};
        var bIw = (bFull && bFull.image_width) || 0;
        var bIh = (bFull && bFull.image_height) || 0;
        var aIw = (aFull && aFull.image_width) || 0;
        var aIh = (aFull && aFull.image_height) || 0;
        var bId = compData.before.id;
        var aId = compData.after.id;
        var bThumb = "/history/" + encodeURIComponent(bId) + "/thumb";
        var aThumb = "/history/" + encodeURIComponent(aId) + "/thumb";

        var tabHtml = '<button class="condition-tab active" data-cpanel="comp-panel-overview">Overview</button>';
        var activeTabs = [];

        CONDITION_TABS.forEach(function (tab) {
            var hasBefore = tab.dials.some(function (d) {
                return typeof getNestedVal(bMetrics, d.path) === "number";
            });
            var hasAfter = tab.dials.some(function (d) {
                return typeof getNestedVal(aMetrics, d.path) === "number";
            });
            if (!hasBefore && !hasAfter) return;
            activeTabs.push(tab);
            tabHtml += '<button class="condition-tab" data-cpanel="comp-panel-' + tab.id + '">' + esc(tab.name) + "</button>";
        });
        tabBar.innerHTML = tabHtml;

        activeTabs.forEach(function (tab) {
            var panel = document.createElement("div");
            panel.className = "comp-panel comp-panel-dynamic";
            panel.id = "comp-panel-" + tab.id;

            var dialsHtml = "";
            var dialCount = 0;

            tab.dials.forEach(function (d) {
                var bv = getNestedVal(bMetrics, d.path);
                var av = getNestedVal(aMetrics, d.path);
                var bIsNum = typeof bv === "number";
                var aIsNum = typeof av === "number";
                if (!bIsNum && !aIsNum) return;

                var bVal = bIsNum ? bv : 0;
                var aVal = aIsNum ? av : 0;
                dialCount++;

                var improved = isImproved(d.dir, bVal, aVal);
                var unchanged = Math.abs(bVal - aVal) < 0.01;
                var diff = Math.round((aVal - bVal) * 100) / 100;
                var diffStr = diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "0";

                var cfg = getDialConfig(d.path, d.dir, bVal, aVal, d.scale);
                var delta = unchanged ? null : { from: bVal, to: aVal, improved: improved };

                var needles = [];
                if (bIsNum) needles.push({ val: bVal, color: BEFORE_COLOR, glow: true });
                if (aIsNum) needles.push({ val: aVal, color: AFTER_COLOR, glow: true });

                var svg = buildGlassDial(cfg, needles, null, delta);

                var verdictClass = unchanged ? "dial-verdict-unchanged"
                    : improved ? "dial-verdict-improved" : "dial-verdict-worsened";
                var verdictText = unchanged ? "Unchanged"
                    : improved ? "Improved" : "Worsened";

                var bStr = bIsNum ? (bVal % 1 === 0 ? String(Math.round(bVal)) : bVal.toFixed(1)) : "-";
                var aStr = aIsNum ? (aVal % 1 === 0 ? String(Math.round(aVal)) : aVal.toFixed(1)) : "-";

                dialsHtml += '<div class="comp-dial-card glass-card">' +
                    '<div class="dial-title">' + esc(d.label) + "</div>" +
                    svg +
                    '<div class="dial-footer">' +
                        '<span class="dial-val dial-val-before">Before: ' + esc(bStr) + "</span>" +
                        '<span class="dial-verdict ' + verdictClass + '">' + esc(verdictText) + " (" + esc(diffStr) + ")</span>" +
                        '<span class="dial-val dial-val-after">After: ' + esc(aStr) + "</span>" +
                    "</div>" +
                "</div>";
            });

            var multiClass = dialCount > 2 ? " comp-dial-grid-sm" : "";

            var bRects = [];
            var aRects = [];
            tab.regions.forEach(function (rk) {
                if (bRegions[rk]) bRects = bRects.concat(bRegions[rk]);
                if (aRegions[rk]) aRects = aRects.concat(aRegions[rk]);
            });
            var bFiltId = "cg-b-" + tab.id;
            var aFiltId = "cg-a-" + tab.id;
            var bEnhanced = buildEnhancedRectSvg(bRects, tab.color, bIw, bIh, bFiltId);
            var aEnhanced = buildEnhancedRectSvg(aRects, tab.color, aIw, aIh, aFiltId);

            var bOverlay = (bIw > 0 && bIh > 0 && bRects.length > 0)
                ? '<svg class="cg-overlay" viewBox="0 0 ' + bIw + ' ' + bIh + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs>' + bEnhanced.defs + '</defs>' + bEnhanced.body + '</svg>'
                : '';
            var aOverlay = (aIw > 0 && aIh > 0 && aRects.length > 0)
                ? '<svg class="cg-overlay" viewBox="0 0 ' + aIw + ' ' + aIh + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs>' + aEnhanced.defs + '</defs>' + aEnhanced.body + '</svg>'
                : '';

            var bBadge = bRects.length > 0
                ? '<div class="cg-badge">' + bRects.length + ' region' + (bRects.length > 1 ? 's' : '') + '</div>'
                : '<div class="cg-badge cg-badge-clear">No regions</div>';
            var aBadge = aRects.length > 0
                ? '<div class="cg-badge">' + aRects.length + ' region' + (aRects.length > 1 ? 's' : '') + '</div>'
                : '<div class="cg-badge cg-badge-clear">No regions</div>';

            panel.innerHTML =
                '<div class="comp-cond-info glass-card">' +
                    '<div class="cg-cell-inner">' +
                    '<h3 class="cg-name">' + esc(tab.name) + "</h3>" +
                    '<div class="cg-desc">' + tab.desc.replace(/\n/g, "<br>") + "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="comp-cond-images">' +
                    '<div class="comp-img-col glass-card">' +
                        '<div class="comp-side-head">' +
                            '<span class="comp-side-dot comp-dot-before"></span>' +
                            '<span class="comp-side-label comp-label-before">Before</span>' +
                        '</div>' +
                        '<div class="cg-img-wrap">' +
                            '<img class="comp-side-img" src="' + bThumb + '" alt="Before">' +
                            bOverlay +
                        '</div>' +
                        bBadge +
                    '</div>' +
                    '<div class="comp-img-col glass-card">' +
                        '<div class="comp-side-head">' +
                            '<span class="comp-side-dot comp-dot-after"></span>' +
                            '<span class="comp-side-label comp-label-after">After</span>' +
                        '</div>' +
                        '<div class="cg-img-wrap">' +
                            '<img class="comp-side-img" src="' + aThumb + '" alt="After">' +
                            aOverlay +
                        '</div>' +
                        aBadge +
                    '</div>' +
                '</div>' +
                '<div class="comp-dial-grid' + multiClass + '">' + dialsHtml + '</div>';

            panels.appendChild(panel);
        });

        tabBar.querySelectorAll(".condition-tab").forEach(function (btn) {
            btn.onclick = function () {
                tabBar.querySelectorAll(".condition-tab").forEach(function (b) { b.classList.remove("active"); });
                panels.querySelectorAll(".comp-panel").forEach(function (p) { p.classList.remove("active"); });
                btn.classList.add("active");
                var target = document.getElementById(btn.dataset.cpanel);
                if (target) target.classList.add("active");
            };
        });
    }

    // ── SVG Overlay Highlighting ──
    const REGION_COLORS = {
        face:          { fill: "rgba(0,229,255,0.25)",   stroke: "#00e5ff" },
        dark_circle:   { fill: "rgba(171,71,188,0.30)",  stroke: "#ab47bc" },
        brown_spot:    { fill: "rgba(141,110,99,0.30)",  stroke: "#8d6e63" },
        blackhead:     { fill: "rgba(255,238,88,0.30)",  stroke: "#ffee58" },
        acne:          { fill: "rgba(239,83,80,0.30)",   stroke: "#ef5350" },
        acne_mark:     { fill: "rgba(239,83,80,0.30)",   stroke: "#ef5350" },
        acne_nodule:   { fill: "rgba(211,47,47,0.30)",   stroke: "#d32f2f" },
        acne_pustule:  { fill: "rgba(255,112,67,0.30)",  stroke: "#ff7043" },
        eye_pouch:     { fill: "rgba(149,117,205,0.30)", stroke: "#9575cd" },
        mole:          { fill: "rgba(121,85,72,0.30)",   stroke: "#795548" },
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
        buildEnhancedRectDom(overlaySvg, rects, colors, "hl-glow-" + regionKey);
    }

    function clearHighlight() {
        overlaySvg.innerHTML = "";
    }

    function hideResults() {
        errorDiv.style.display = "none";
        resultsDiv.style.display = "none";
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
    }

    // ══════════════════════════════════════════════════
    //  COMPARE PAGE
    // ══════════════════════════════════════════════════

    const historyLoading = document.getElementById("history-loading");
    const noHistory = document.getElementById("no-history");
    const historyGrid = document.getElementById("history-grid");
    const beforeList = document.getElementById("before-list");
    const afterList = document.getElementById("after-list");
    const btnCompare = document.getElementById("btn-compare");
    const compareLoading = document.getElementById("compare-loading");
    const compareError = document.getElementById("compare-error");
    const compareResults = document.getElementById("compare-results");
    const compareHeader = document.getElementById("compare-header");
    const compareCharts = document.getElementById("compare-charts");

    let selectedBefore = null;
    let selectedAfter = null;

    async function loadHistory() {
        historyLoading.style.display = "flex";
        noHistory.style.display = "none";
        historyGrid.style.display = "none";
        compareResults.style.display = "none";
        compareError.style.display = "none";
        selectedBefore = null;
        selectedAfter = null;
        btnCompare.disabled = true;

        try {
            const res = await fetch("/history");
            if (!res.ok) throw new Error("Failed to load history");
            const entries = await res.json();

            if (entries.length < 2) {
                noHistory.style.display = "block";
                noHistory.querySelector("p").textContent =
                    entries.length === 0
                        ? "No analyses yet. Run at least two analyses first, then come back to compare."
                        : "Only one analysis found. Run at least one more, then come back to compare.";
                return;
            }

            beforeList.innerHTML = "";
            afterList.innerHTML = "";

            entries.forEach((entry) => {
                const card = buildHistoryCard(entry);
                const cardClone = buildHistoryCard(entry);

                card.onclick = () => selectCard(beforeList, card, entry.id, "before");
                cardClone.onclick = () => selectCard(afterList, cardClone, entry.id, "after");

                beforeList.appendChild(card);
                afterList.appendChild(cardClone);
            });

            historyGrid.style.display = "grid";
        } catch (err) {
            noHistory.style.display = "block";
            noHistory.querySelector("p").textContent = "Error loading history: " + err.message;
        } finally {
            historyLoading.style.display = "none";
        }
    }

    function buildHistoryCard(entry) {
        const card = document.createElement("div");
        card.className = "history-card";
        card.dataset.id = entry.id;

        const ts = entry.timestamp ? new Date(entry.timestamp) : null;
        const dateStr = ts ? ts.toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit"
        }) : entry.id;

        card.innerHTML =
            '<img class="history-thumb" src="/history/' + esc(entry.id) + '/thumb" alt="Thumbnail" loading="lazy">' +
            '<div class="history-info">' +
            '<div class="history-date">' + esc(dateStr) + "</div>" +
            '<div class="history-id">' + esc(entry.id) + "</div>" +
            "</div>";
        return card;
    }

    function selectCard(listEl, card, id, role) {
        listEl.querySelectorAll(".history-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        if (role === "before") selectedBefore = id;
        else selectedAfter = id;
        btnCompare.disabled = !(selectedBefore && selectedAfter && selectedBefore !== selectedAfter);
    }

    btnCompare.onclick = async () => {
        if (!selectedBefore || !selectedAfter || selectedBefore === selectedAfter) return;

        btnCompare.disabled = true;
        compareLoading.style.display = "flex";
        compareError.style.display = "none";
        compareResults.style.display = "none";

        try {
            const [compRes, bDataRes, aDataRes] = await Promise.all([
                fetch("/compare/" + encodeURIComponent(selectedBefore) + "/" + encodeURIComponent(selectedAfter)),
                fetch("/history/" + encodeURIComponent(selectedBefore) + "/data"),
                fetch("/history/" + encodeURIComponent(selectedAfter) + "/data")
            ]);
            if (!compRes.ok) {
                const d = await compRes.json().catch(() => ({}));
                throw new Error(d.detail || "Comparison failed");
            }
            const data = await compRes.json();
            const bFullData = bDataRes.ok ? await bDataRes.json() : null;
            const aFullData = aDataRes.ok ? await aDataRes.json() : null;
            renderComparison(data, bFullData, aFullData);
        } catch (err) {
            compareError.textContent = err instanceof Error ? err.message : String(err);
            compareError.style.display = "block";
        } finally {
            compareLoading.style.display = "none";
            btnCompare.disabled = false;
        }
    };

    function renderComparison(data, bFullData, aFullData) {
        const bDate = data.before.timestamp ? new Date(data.before.timestamp).toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric"
        }) : data.before.id;
        const aDate = data.after.timestamp ? new Date(data.after.timestamp).toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric"
        }) : data.after.id;

        compareHeader.innerHTML =
            '<div class="compare-header-item">' +
            '<img src="/history/' + esc(data.before.id) + '/thumb" alt="Before">' +
            '<div class="ch-label">BEFORE</div>' +
            '<div class="ch-date">' + esc(bDate) + "</div></div>" +
            '<div class="compare-header-arrow">&#10132;</div>' +
            '<div class="compare-header-item">' +
            '<img src="/history/' + esc(data.after.id) + '/thumb" alt="After">' +
            '<div class="ch-label">AFTER</div>' +
            '<div class="ch-date">' + esc(aDate) + "</div></div>";

        const rows = data.comparisons || [];
        if (rows.length === 0) {
            compareCharts.innerHTML = '<div class="empty-state"><p>No comparable parameters found.</p></div>';
            compareResults.style.display = "block";
            return;
        }

        var categories = {};
        var catOrder = [];
        rows.forEach(function (r) {
            var cat = r.category || "Other";
            if (!categories[cat]) {
                categories[cat] = [];
                catOrder.push(cat);
            }
            categories[cat].push(r);
        });

        var html = "";
        catOrder.forEach(function (cat) {
            var items = categories[cat];
            html += '<div class="cat-section">';
            html += '<div class="cat-title">' + esc(cat) + "</div>";

            var hasDials = false;
            var dialHtml = "";
            var textHtml = "";

            items.forEach(function (r) {
                var bNum = typeof r.before === "number" ? r.before : null;
                var aNum = typeof r.after === "number" ? r.after : null;
                var isNumeric = r.numeric && (bNum !== null || aNum !== null);

                if (isNumeric) {
                    hasDials = true;
                    dialHtml += buildDialRow(r, bNum, aNum);
                } else {
                    textHtml += buildTextRow(r);
                }
            });

            if (hasDials) {
                html += '<div class="dial-grid">' + dialHtml + "</div>";
            }
            html += textHtml;
            html += "</div>";
        });

        compareCharts.innerHTML = html;
        compareResults.style.display = "block";

        buildCompareConditionTabs(data, bFullData, aFullData);

        compareResults.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ══════════════════════════════════════════════════
    //  LIQUID GLASS DIAL ENGINE
    // ══════════════════════════════════════════════════

    var DIAL_UID = 0;

    var SCORE_ZONES = [
        { min: 0,  max: 30,  label: "",         color: [220, 40, 60] },
        { min: 30, max: 50,  label: "Severe",   color: [350, 65, 55] },
        { min: 50, max: 70,  label: "Moderate",  color: [30, 90, 55] },
        { min: 70, max: 90,  label: "Mild",      color: [80, 70, 50] },
        { min: 90, max: 100, label: "None",      color: [150, 65, 42] }
    ];

    var SEVERITY_ZONES = [
        { min: 0,   max: 0.5, label: "None",     color: [150, 65, 42] },
        { min: 0.5, max: 1.5, label: "Mild",     color: [80, 70, 50] },
        { min: 1.5, max: 2.5, label: "Moderate",  color: [30, 90, 55] },
        { min: 2.5, max: 3,   label: "Severe",   color: [350, 65, 55] }
    ];

    function countZones(maxVal) {
        var q = maxVal / 4;
        return [
            { min: 0,     max: q,     label: "Low",       color: [150, 65, 42] },
            { min: q,     max: q * 2, label: "Medium",    color: [80, 70, 50] },
            { min: q * 2, max: q * 3, label: "High",      color: [30, 90, 55] },
            { min: q * 3, max: maxVal, label: "Very High", color: [350, 65, 55] }
        ];
    }

    function getDialConfig(key, dir, val1, val2, scale) {
        if (scale === "severity") return { min: 0, max: 3, zones: SEVERITY_ZONES };
        if (scale === "score") return { min: 0, max: 100, zones: SCORE_ZONES };
        if (scale === "count_spots") {
            var mx = Math.max(val1 || 0, val2 || 0, 30);
            mx = Math.ceil(mx / 10) * 10;
            if (mx < 10) mx = 10;
            return { min: 0, max: mx, zones: [
                { min: 0,          max: mx * 0.1,  label: "None",     color: [150, 65, 42] },
                { min: mx * 0.1,   max: mx * 0.35, label: "Few",      color: [80, 70, 50] },
                { min: mx * 0.35,  max: mx * 0.65, label: "Moderate", color: [30, 90, 55] },
                { min: mx * 0.65,  max: mx,        label: "Many",     color: [350, 65, 55] }
            ] };
        }
        if (scale === "skin_type") return { min: 0, max: 100, zones: [
            { min: 0,  max: 15, label: "Neutral",  color: [150, 65, 42] },
            { min: 15, max: 40, label: "Dry",      color: [80, 70, 50] },
            { min: 40, max: 60, label: "Combo",    color: [30, 90, 55] },
            { min: 60, max: 100, label: "Oily",    color: [350, 65, 55] }
        ] };
        if (scale === "age") {
            var ma = Math.max(val1 || 0, val2 || 0, 80);
            return { min: 0, max: ma, zones: [
                { min: 0,        max: ma * 0.3,  label: "Young",  color: [150, 65, 42] },
                { min: ma * 0.3, max: ma * 0.5,  label: "Good",   color: [80, 70, 50] },
                { min: ma * 0.5, max: ma * 0.75, label: "Mature", color: [30, 90, 55] },
                { min: ma * 0.75, max: ma,        label: "Aged",   color: [350, 65, 55] }
            ] };
        }
        if (dir === "higher_is_better") {
            return { min: 0, max: 100, zones: SCORE_ZONES };
        }
        if (key.indexOf("severity") !== -1) {
            return { min: 0, max: 3, zones: SEVERITY_ZONES };
        }
        if (key.indexOf("skin_age") !== -1) {
            var mx = Math.max(val1 || 0, val2 || 0, 80);
            return { min: 0, max: mx, zones: [
                { min: 0,        max: mx * 0.3,  label: "Young",  color: [150, 65, 42] },
                { min: mx * 0.3, max: mx * 0.5,  label: "Good",   color: [80, 70, 50] },
                { min: mx * 0.5, max: mx * 0.75, label: "Mature", color: [30, 90, 55] },
                { min: mx * 0.75, max: mx,        label: "Aged",   color: [350, 65, 55] }
            ] };
        }
        if (key.indexOf("area_percentage") !== -1 || key.indexOf("intensity") !== -1) {
            var mx2 = Math.max(val1 || 0, val2 || 0, 100);
            return { min: 0, max: mx2, zones: [
                { min: 0,         max: mx2 * 0.1, label: "None",     color: [150, 65, 42] },
                { min: mx2 * 0.1, max: mx2 * 0.3, label: "Mild",     color: [80, 70, 50] },
                { min: mx2 * 0.3, max: mx2 * 0.6, label: "Moderate", color: [30, 90, 55] },
                { min: mx2 * 0.6, max: mx2,        label: "Severe",  color: [350, 65, 55] }
            ] };
        }
        if (key.indexOf("skin_type_score") !== -1) {
            return { min: 0, max: 100, zones: [
                { min: 0,  max: 15, label: "Neutral",  color: [150, 65, 42] },
                { min: 15, max: 40, label: "Dry",      color: [80, 70, 50] },
                { min: 40, max: 60, label: "Combo",    color: [30, 90, 55] },
                { min: 60, max: 100, label: "Oily",    color: [350, 65, 55] }
            ] };
        }
        var cMax = Math.max(val1 || 0, val2 || 0, 5);
        cMax = Math.ceil(cMax * 1.3);
        return { min: 0, max: cMax, zones: countZones(cMax) };
    }

    function hsl(c, alphaStr) {
        if (alphaStr) return "hsla(" + c[0] + "," + c[1] + "%," + c[2] + "%," + alphaStr + ")";
        return "hsl(" + c[0] + "," + c[1] + "%," + c[2] + "%)";
    }
    function hslLight(c, bump) {
        return [c[0], Math.min(c[1] + 10, 100), Math.min(c[2] + bump, 95)];
    }

    function buildGlassDial(cfg, needles, centerLabel, deltaArc) {
        var uid = "gd" + (++DIAL_UID);
        var W = 240, H = 155;
        var cx = 120, cy = 130;
        var R = 95, r2 = 62;
        var PI = Math.PI;

        var s = '<svg class="dial-svg" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg">';

        s += "<defs>";
        cfg.zones.forEach(function (z, i) {
            var gid = uid + "zg" + i;
            var base = z.color;
            s += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">';
            s += '<stop offset="0%" stop-color="' + hsl(hslLight(base, 18)) + '" stop-opacity="0.9"/>';
            s += '<stop offset="50%" stop-color="' + hsl(base) + '" stop-opacity="0.8"/>';
            s += '<stop offset="100%" stop-color="' + hsl(hslLight(base, -6)) + '" stop-opacity="0.7"/>';
            s += "</linearGradient>";
        });
        var glassId = uid + "glass";
        s += '<radialGradient id="' + glassId + '" cx="50%" cy="30%" r="70%">';
        s += '<stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>';
        s += '<stop offset="100%" stop-color="rgba(255,255,255,0.05)"/>';
        s += "</radialGradient>";
        var hubId = uid + "hub";
        s += '<radialGradient id="' + hubId + '" cx="40%" cy="35%" r="60%">';
        s += '<stop offset="0%" stop-color="rgba(220,240,255,0.95)"/>';
        s += '<stop offset="100%" stop-color="rgba(100,160,220,0.8)"/>';
        s += "</radialGradient>";
        if (deltaArc && typeof deltaArc.from === "number" && typeof deltaArc.to === "number") {
            var daGid = uid + "da";
            var daH = deltaArc.improved ? 140 : 0;
            var daS = deltaArc.improved ? 60 : 60;
            var daL = deltaArc.improved ? 48 : 50;
            s += '<radialGradient id="' + daGid + '" cx="50%" cy="100%" r="100%">';
            s += '<stop offset="0%" stop-color="hsla(' + daH + ',' + daS + '%,' + daL + '%,0.2)"/>';
            s += '<stop offset="40%" stop-color="hsla(' + daH + ',' + daS + '%,' + daL + '%,0.4)"/>';
            s += '<stop offset="100%" stop-color="hsla(' + daH + ',' + daS + '%,' + (daL + 5) + '%,0.55)"/>';
            s += "</radialGradient>";
            var daGlowId = uid + "dag";
            s += '<filter id="' + daGlowId + '"><feGaussianBlur stdDeviation="2.5" result="b"/>';
            s += '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
        }
        s += "</defs>";

        cfg.zones.forEach(function (z, i) {
            var a1 = PI - ((z.min - cfg.min) / (cfg.max - cfg.min)) * PI;
            var a2 = PI - ((z.max - cfg.min) / (cfg.max - cfg.min)) * PI;
            var x1o = cx + R * Math.cos(a1), y1o = cy - R * Math.sin(a1);
            var x2o = cx + R * Math.cos(a2), y2o = cy - R * Math.sin(a2);
            var x1i = cx + r2 * Math.cos(a2), y1i = cy - r2 * Math.sin(a2);
            var x2i = cx + r2 * Math.cos(a1), y2i = cy - r2 * Math.sin(a1);
            var large = (z.max - z.min) / (cfg.max - cfg.min) > 0.5 ? 1 : 0;
            var d = "M " + x1o.toFixed(1) + " " + y1o.toFixed(1) +
                " A " + R + " " + R + " 0 " + large + " 1 " + x2o.toFixed(1) + " " + y2o.toFixed(1) +
                " L " + x1i.toFixed(1) + " " + y1i.toFixed(1) +
                " A " + r2 + " " + r2 + " 0 " + large + " 0 " + x2i.toFixed(1) + " " + y2i.toFixed(1) + " Z";

            s += '<path d="' + d + '" fill="url(#' + uid + "zg" + i + ')"/>';
            s += '<path d="' + d + '" fill="url(#' + glassId + ')"/>';

            if (z.label) {
                var midVal = (z.min + z.max) / 2;
                var midA = PI - ((midVal - cfg.min) / (cfg.max - cfg.min)) * PI;
                var lr = (R + r2) / 2;
                var lx = cx + lr * Math.cos(midA);
                var ly = cy - lr * Math.sin(midA);
                s += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
                    '" text-anchor="middle" dominant-baseline="central"' +
                    ' fill="rgba(255,255,255,0.95)" font-size="8.5" font-weight="700"' +
                    ' style="text-shadow:0 1px 4px rgba(0,40,80,0.45)">' + z.label + "</text>";
            }
        });

        var outerR = R + 2;
        s += '<path d="M ' + (cx - outerR) + " " + cy + " A " + outerR + " " + outerR +
            ' 0 0 1 ' + (cx + outerR) + " " + cy + '" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>';
        s += '<path d="M ' + (cx - r2 + 2) + " " + cy + " A " + (r2 - 2) + " " + (r2 - 2) +
            ' 0 0 1 ' + (cx + r2 - 2) + " " + cy + '" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>';

        var tickCount = 5;
        for (var i = 0; i <= tickCount; i++) {
            var tv = cfg.min + (cfg.max - cfg.min) * (i / tickCount);
            var ta = PI - (i / tickCount) * PI;
            var tx1 = cx + (R + 2) * Math.cos(ta), ty1 = cy - (R + 2) * Math.sin(ta);
            var tx2 = cx + (R + 7) * Math.cos(ta), ty2 = cy - (R + 7) * Math.sin(ta);
            s += '<line x1="' + tx1.toFixed(1) + '" y1="' + ty1.toFixed(1) +
                '" x2="' + tx2.toFixed(1) + '" y2="' + ty2.toFixed(1) +
                '" stroke="rgba(26,60,100,0.3)" stroke-width="1.2" stroke-linecap="round"/>';
            var tlx = cx + (R + 16) * Math.cos(ta), tly = cy - (R + 16) * Math.sin(ta);
            var dv = tv % 1 === 0 ? String(Math.round(tv)) : tv.toFixed(1);
            s += '<text x="' + tlx.toFixed(1) + '" y="' + tly.toFixed(1) +
                '" text-anchor="middle" dominant-baseline="central" fill="rgba(26,58,92,0.6)" font-size="7.5">' +
                dv + "</text>";
        }

        if (deltaArc && typeof deltaArc.from === "number" && typeof deltaArc.to === "number") {
            var range = cfg.max - cfg.min;
            var fromClamped = Math.min(Math.max(deltaArc.from, cfg.min), cfg.max);
            var toClamped = Math.min(Math.max(deltaArc.to, cfg.min), cfg.max);
            var fromRatio = (fromClamped - cfg.min) / range;
            var toRatio = (toClamped - cfg.min) / range;

            if (Math.abs(fromRatio - toRatio) > 0.003) {
                var fromA = PI - fromRatio * PI;
                var toA = PI - toRatio * PI;
                var startA = Math.max(fromA, toA);
                var endA = Math.min(fromA, toA);

                var hubR = 12;
                var outerArcR = R + 1;

                var ax1o = cx + outerArcR * Math.cos(startA), ay1o = cy - outerArcR * Math.sin(startA);
                var ax2o = cx + outerArcR * Math.cos(endA),   ay2o = cy - outerArcR * Math.sin(endA);
                var ax1i = cx + hubR * Math.cos(endA),         ay1i = cy - hubR * Math.sin(endA);
                var ax2i = cx + hubR * Math.cos(startA),       ay2i = cy - hubR * Math.sin(startA);
                var arcSpan = (startA - endA) / PI;
                var arcLarge = arcSpan > 0.5 ? 1 : 0;

                var sectorPath = "M " + ax1o.toFixed(1) + " " + ay1o.toFixed(1) +
                    " A " + outerArcR + " " + outerArcR + " 0 " + arcLarge + " 1 " + ax2o.toFixed(1) + " " + ay2o.toFixed(1) +
                    " L " + ax1i.toFixed(1) + " " + ay1i.toFixed(1) +
                    " A " + hubR + " " + hubR + " 0 " + arcLarge + " 0 " + ax2i.toFixed(1) + " " + ay2i.toFixed(1) + " Z";

                var daGid = uid + "da";
                var daGlowId = uid + "dag";
                s += '<path d="' + sectorPath + '" fill="url(#' + daGid + ')" filter="url(#' + daGlowId + ')"/>';

                var edgeColor = deltaArc.improved
                    ? "hsla(140,65%,45%,0.7)"
                    : "hsla(0,65%,50%,0.7)";
                s += '<path d="M ' + ax1o.toFixed(1) + " " + ay1o.toFixed(1) +
                    " A " + outerArcR + " " + outerArcR + " 0 " + arcLarge + " 1 " + ax2o.toFixed(1) + " " + ay2o.toFixed(1) +
                    '" fill="none" stroke="' + edgeColor + '" stroke-width="2" stroke-linecap="round"/>';
                s += '<line x1="' + ax1o.toFixed(1) + '" y1="' + ay1o.toFixed(1) +
                    '" x2="' + ax2i.toFixed(1) + '" y2="' + ay2i.toFixed(1) +
                    '" stroke="' + edgeColor + '" stroke-width="1.2" opacity="0.5"/>';
                s += '<line x1="' + ax2o.toFixed(1) + '" y1="' + ay2o.toFixed(1) +
                    '" x2="' + ax1i.toFixed(1) + '" y2="' + ay1i.toFixed(1) +
                    '" stroke="' + edgeColor + '" stroke-width="1.2" opacity="0.5"/>';
            }
        }

        needles.forEach(function (n) {
            s += drawGlassNeedle(cx, cy, R, cfg, n.val, n.color, n.glow);
        });

        s += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="url(#' + hubId + ')" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>';
        s += '<circle cx="' + (cx - 1.5) + '" cy="' + (cy - 2) + '" r="3" fill="rgba(255,255,255,0.7)"/>';

        if (centerLabel !== undefined && centerLabel !== null) {
            s += '<text x="' + cx + '" y="' + (cy - 20) +
                '" text-anchor="middle" fill="rgba(26,58,92,0.9)" font-size="16" font-weight="700"' +
                ' style="text-shadow:0 0 8px rgba(255,255,255,0.8)">' + esc(String(centerLabel)) + "</text>";
        }

        s += "</svg>";
        return s;
    }

    function drawGlassNeedle(cx, cy, R, cfg, val, color, glow) {
        var clamped = Math.min(Math.max(val, cfg.min), cfg.max);
        var ratio = (clamped - cfg.min) / (cfg.max - cfg.min);
        var angle = Math.PI - ratio * Math.PI;
        var needleR = R - 10;
        var nx = cx + needleR * Math.cos(angle);
        var ny = cy - needleR * Math.sin(angle);
        var bx = cx - 5 * Math.cos(angle);
        var by = cy + 5 * Math.sin(angle);
        var perpX = 3 * Math.sin(angle);
        var perpY = 3 * Math.cos(angle);

        var s = "";
        if (glow) {
            s += '<line x1="' + cx + '" y1="' + cy +
                '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) +
                '" stroke="' + color + '" stroke-width="6" stroke-linecap="round" opacity="0.25"' +
                ' filter="url(#blur-none)"/>';
        }
        s += '<polygon points="' +
            nx.toFixed(1) + "," + ny.toFixed(1) + " " +
            (bx + perpX).toFixed(1) + "," + (by + perpY).toFixed(1) + " " +
            (bx - perpX).toFixed(1) + "," + (by - perpY).toFixed(1) +
            '" fill="' + color + '" opacity="0.9"/>';
        s += '<line x1="' + cx + '" y1="' + cy +
            '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) +
            '" stroke="rgba(255,255,255,0.8)" stroke-width="0.8" stroke-linecap="round"/>';
        s += '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) +
            '" r="3.5" fill="' + color + '" stroke="rgba(255,255,255,0.85)" stroke-width="1"/>';
        return s;
    }

    // Build a comparison dial card (two needles + delta arc)
    function buildDialRow(r, bNum, aNum) {
        var b = bNum !== null ? bNum : 0;
        var a = aNum !== null ? aNum : 0;
        var diff = Math.round((a - b) * 100) / 100;
        var diffStr = diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "0";
        var verdictClass = "dial-verdict-" + r.verdict;
        var verdictText = r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1);

        var cfg = getDialConfig(r.key || "", r.direction || "neutral", b, a);
        var unchanged = Math.abs(b - a) < 0.01;
        var improved = isImproved(r.direction || "neutral", b, a);
        var delta = unchanged ? null : { from: b, to: a, improved: improved };
        var svg = buildGlassDial(cfg, [
            { val: b, color: BEFORE_COLOR, glow: true },
            { val: a, color: AFTER_COLOR, glow: true }
        ], null, delta);

        return (
            '<div class="dial-card glass-card">' +
            '<div class="dial-title">' + esc(r.label) + "</div>" +
            svg +
            '<div class="dial-footer">' +
            '<span class="dial-val dial-val-before">Before: ' + esc(String(bNum !== null ? bNum : "-")) + "</span>" +
            '<span class="dial-verdict ' + verdictClass + '">' + esc(verdictText) + " (" + esc(diffStr) + ")</span>" +
            '<span class="dial-val dial-val-after">After: ' + esc(String(aNum !== null ? aNum : "-")) + "</span>" +
            "</div></div>"
        );
    }

    // Build a single-value dial for the analysis page
    function buildSingleDial(label, value, key, direction) {
        var cfg = getDialConfig(key, direction, value, 0);
        var svg = buildGlassDial(cfg, [
            { val: value, color: "rgba(74,144,217,0.95)", glow: true }
        ], value % 1 === 0 ? String(Math.round(value)) : value.toFixed(1));

        return (
            '<div class="dial-card glass-card">' +
            '<div class="dial-title">' + esc(label) + "</div>" +
            svg +
            "</div>"
        );
    }

    function buildTextRow(r) {
        var bv = r.before === null || r.before === undefined ? "-" : String(r.before);
        var av = r.after === null || r.after === undefined ? "-" : String(r.after);
        var changed = bv !== av;
        return (
            '<div class="text-compare-row">' +
            '<span class="text-compare-label">' + esc(r.label) + "</span>" +
            '<div class="text-compare-vals">' +
            '<span class="text-val-before">' + esc(bv) + "</span>" +
            '<span class="text-arrow">' + (changed ? "&#10132;" : "=") + "</span>" +
            '<span class="text-val-after">' + esc(av) + "</span>" +
            "</div></div>"
        );
    }

    // ══════════════════════════════════════════════════
    //  SHARED HELPERS
    // ══════════════════════════════════════════════════

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
