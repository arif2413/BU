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
                dialsContainer.style.display = "block";
            }
        }

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
            const res = await fetch("/compare/" + encodeURIComponent(selectedBefore) + "/" + encodeURIComponent(selectedAfter));
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail || "Comparison failed");
            }
            const data = await res.json();
            renderComparison(data);
        } catch (err) {
            compareError.textContent = err instanceof Error ? err.message : String(err);
            compareError.style.display = "block";
        } finally {
            compareLoading.style.display = "none";
            btnCompare.disabled = false;
        }
    };

    function renderComparison(data) {
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

    function getDialConfig(key, dir, val1, val2) {
        if (dir === "higher_is_better") {
            return { min: 0, max: 100, zones: SCORE_ZONES };
        }
        if (key.indexOf(".severity") !== -1 || key.indexOf("oily_severity") !== -1) {
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
                { min: mx2 * 0.3, max: mx2 * 0.6, label: "Moderate",  color: [30, 90, 55] },
                { min: mx2 * 0.6, max: mx2,        label: "Severe",   color: [350, 65, 55] }
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

    function buildGlassDial(cfg, needles, centerLabel) {
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
            s += '<stop offset="0%" stop-color="' + hsl(hslLight(base, 22)) + '" stop-opacity="0.85"/>';
            s += '<stop offset="50%" stop-color="' + hsl(base) + '" stop-opacity="0.7"/>';
            s += '<stop offset="100%" stop-color="' + hsl(hslLight(base, -8)) + '" stop-opacity="0.6"/>';
            s += "</linearGradient>";
        });
        var glassId = uid + "glass";
        s += '<radialGradient id="' + glassId + '" cx="50%" cy="30%" r="70%">';
        s += '<stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>';
        s += '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>';
        s += "</radialGradient>";
        var hubId = uid + "hub";
        s += '<radialGradient id="' + hubId + '" cx="40%" cy="35%" r="60%">';
        s += '<stop offset="0%" stop-color="rgba(200,220,255,0.9)"/>';
        s += '<stop offset="100%" stop-color="rgba(80,100,140,0.7)"/>';
        s += "</radialGradient>";
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
                    ' fill="rgba(255,255,255,0.92)" font-size="8.5" font-weight="600"' +
                    ' style="text-shadow:0 1px 3px rgba(0,0,0,0.5)">' + z.label + "</text>";
            }
        });

        var outerR = R + 2;
        s += '<path d="M ' + (cx - outerR) + " " + cy + " A " + outerR + " " + outerR +
            ' 0 0 1 ' + (cx + outerR) + " " + cy + '" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>';
        s += '<path d="M ' + (cx - r2 + 2) + " " + cy + " A " + (r2 - 2) + " " + (r2 - 2) +
            ' 0 0 1 ' + (cx + r2 - 2) + " " + cy + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>';

        var tickCount = 5;
        for (var i = 0; i <= tickCount; i++) {
            var tv = cfg.min + (cfg.max - cfg.min) * (i / tickCount);
            var ta = PI - (i / tickCount) * PI;
            var tx1 = cx + (R + 2) * Math.cos(ta), ty1 = cy - (R + 2) * Math.sin(ta);
            var tx2 = cx + (R + 7) * Math.cos(ta), ty2 = cy - (R + 7) * Math.sin(ta);
            s += '<line x1="' + tx1.toFixed(1) + '" y1="' + ty1.toFixed(1) +
                '" x2="' + tx2.toFixed(1) + '" y2="' + ty2.toFixed(1) +
                '" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round"/>';
            var tlx = cx + (R + 16) * Math.cos(ta), tly = cy - (R + 16) * Math.sin(ta);
            var dv = tv % 1 === 0 ? String(Math.round(tv)) : tv.toFixed(1);
            s += '<text x="' + tlx.toFixed(1) + '" y="' + tly.toFixed(1) +
                '" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.55)" font-size="7.5">' +
                dv + "</text>";
        }

        needles.forEach(function (n) {
            s += drawGlassNeedle(cx, cy, R, cfg, n.val, n.color, n.glow);
        });

        s += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="url(#' + hubId + ')" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>';
        s += '<circle cx="' + (cx - 1.5) + '" cy="' + (cy - 2) + '" r="3" fill="rgba(255,255,255,0.5)"/>';

        if (centerLabel !== undefined && centerLabel !== null) {
            s += '<text x="' + cx + '" y="' + (cy - 20) +
                '" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-size="16" font-weight="700"' +
                ' style="text-shadow:0 0 10px rgba(100,180,255,0.6)">' + esc(String(centerLabel)) + "</text>";
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
            '" stroke="rgba(255,255,255,0.5)" stroke-width="0.8" stroke-linecap="round"/>';
        s += '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) +
            '" r="3.5" fill="' + color + '" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>';
        return s;
    }

    // Build a comparison dial card (two needles)
    function buildDialRow(r, bNum, aNum) {
        var b = bNum !== null ? bNum : 0;
        var a = aNum !== null ? aNum : 0;
        var diff = Math.round((a - b) * 100) / 100;
        var diffStr = diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "0";
        var verdictClass = "dial-verdict-" + r.verdict;
        var verdictText = r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1);

        var cfg = getDialConfig(r.key || "", r.direction || "neutral", b, a);
        var svg = buildGlassDial(cfg, [
            { val: b, color: "rgba(74,144,217,0.9)", glow: true },
            { val: a, color: "rgba(168,85,247,0.9)", glow: true }
        ], null);

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
