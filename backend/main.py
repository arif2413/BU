"""
FastAPI backend for skin analysis - accepts image upload, returns metrics + annotated image.
"""
import os
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv

from analyzer import run_analysis

load_dotenv()

app = FastAPI(title="Skin Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Skin Analysis</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #fff; margin: 0; padding: 24px; }
        h1 { margin-bottom: 8px; }
        .subtitle { color: #a0a0a0; margin-bottom: 24px; }
        .upload-zone { position: relative; border: 2px dashed #4a90d9; border-radius: 12px; padding: 48px; text-align: center; cursor: pointer; margin-bottom: 16px; display: block; }
        .upload-zone:hover { background: #252540; }
        .upload-zone.dragover { border-color: #6ab0ff; background: #252540; }
        .file-input-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
        .choose-btn { display: inline-block; margin-top: 12px; padding: 10px 24px; background: #4a90d9; color: #fff; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .choose-btn:hover { background: #5a9fe9; }
        .btn { background: #4a90d9; color: #fff; border: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; cursor: pointer; }
        .btn:hover { background: #5a9fe9; }
        .btn:disabled { background: #555; cursor: not-allowed; }
        .preview { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 16px 0; }
        .results { margin-top: 32px; padding-top: 24px; border-top: 1px solid #333; }
        .results-flex { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
        .result-img-wrap { position: relative; flex-shrink: 0; }
        .result-img { max-width: 100%; border-radius: 8px; display: block; }
        .result-overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
        .metrics { background: #252540; border-radius: 8px; padding: 20px; min-width: 280px; flex: 1; }
        .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; cursor: pointer; border-radius: 6px; transition: background 0.15s; width: 100%; }
        .metric-row:hover { background: #333355; }
        .metric-row.active { background: #2a3a5a; outline: 1px solid #4a90d9; }
        .metric-item { display: flex; flex-direction: column; width: 100%; border-bottom: 1px solid #333; padding-bottom: 4px; }
        .metric-item:last-child { border-bottom: none; }
        .metric-row[data-region=""] { cursor: default; }
        .metric-row[data-region=""]:hover { background: transparent; }
        .metric-row .key { flex: 1; min-width: 0; }
        .metric-row .key.highlightable { color: #4a90d9; }
        .metric-row .key.non-highlightable { color: #888; }
        .metric-row .val { flex-shrink: 0; margin-left: 12px; color: #fff; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .metric-row .row-content { display: flex; justify-content: space-between; align-items: center; width: 100%; }
        .metric-arrow { display: flex; justify-content: center; padding: 4px 0; cursor: pointer; color: #6ab0ff; font-size: 12px; transition: transform 0.2s; }
        .metric-arrow:hover { color: #8ac8ff; }
        .metric-arrow.expanded { transform: rotate(180deg); }
        .metric-explain { background: #1a1a2e; border: 1px solid #333; border-radius: 6px; padding: 10px 12px; margin-top: 4px; font-size: 12px; color: #b0b0b0; line-height: 1.4; display: none; }
        .metric-explain.show { display: block; }
        .metrics { max-height: 70vh; overflow-y: auto; }
        .error { color: #ff6b6b; margin-top: 16px; }
        .loading { color: #4a90d9; margin-top: 16px; }
    </style>
</head>
<body>
    <h1>Skin Analysis</h1>
    <p class="subtitle">Upload a face image (JPEG or PNG) for skin analysis</p>

    <label class="upload-zone" id="zone" for="file">
        <p id="zone-text">Click the button below or drag image here</p>
        <span class="choose-btn" id="choose-btn">Choose Image</span>
        <img id="preview" class="preview" style="display:none;">
    </label>
    <input type="file" id="file" accept="image/jpeg,image/png,image/jpg,image/webp" class="file-input-hidden">

    <button class="btn" id="analyze" disabled>Analyze</button>

    <div id="loading" class="loading" style="display:none;">Analyzing...</div>
    <div id="error" class="error" style="display:none;"></div>
    <div id="results" class="results" style="display:none;">
        <h2>Results</h2>
        <p class="subtitle" style="margin-bottom:16px;">Click a metric on the right to highlight that area on the image</p>
        <div class="results-flex">
            <div class="result-img-wrap" id="img-wrap">
                <img id="result-img" class="result-img">
                <svg id="result-overlay" class="result-overlay" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
            <div class="metrics" id="metrics"></div>
        </div>
        <details style="margin-top:20px;"><summary style="cursor:pointer;color:#4a90d9;">Raw JSON output</summary><pre id="raw-output" style="background:#252540;padding:12px;border-radius:8px;font-size:11px;overflow:auto;max-height:200px;"></pre></details>
    </div>

    <script>
        const zone = document.getElementById('zone');
        const fileInput = document.getElementById('file');
        const preview = document.getElementById('preview');
        const zoneText = document.getElementById('zone-text');
        const analyzeBtn = document.getElementById('analyze');
        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');
        const resultsDiv = document.getElementById('results');
        const resultImg = document.getElementById('result-img');
        const metricsDiv = document.getElementById('metrics');
        const rawPre = document.getElementById('raw-output');
        const overlaySvg = document.getElementById('result-overlay');
        let regionsData = {};
        let imgW = 0, imgH = 0;

        function drawHighlight(regionKey) {
            overlaySvg.innerHTML = '';
            const keys = regionKey === 'acne' ? ['acne', 'acne_mark'] : [regionKey];
            let rects = [];
            for (const k of keys) {
                if (regionsData[k]) rects = rects.concat(regionsData[k]);
            }
            if (!rects.length) return;
            for (const r of rects) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', r.left);
                rect.setAttribute('y', r.top);
                rect.setAttribute('width', r.width);
                rect.setAttribute('height', r.height);
                rect.setAttribute('fill', 'rgba(74, 144, 217, 0.35)');
                rect.setAttribute('stroke', '#4a90d9');
                rect.setAttribute('stroke-width', '2');
                overlaySvg.appendChild(rect);
            }
        }

        function clearHighlight() {
            overlaySvg.innerHTML = '';
        }

        zone.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); };
        zone.ondragleave = (e) => { e.preventDefault(); zone.classList.remove('dragover'); };
        zone.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length && files[0].type.startsWith('image/')) {
                try {
                    const dt = new DataTransfer();
                    dt.items.add(files[0]);
                    fileInput.files = dt.files;
                    updatePreview();
                } catch (err) {
                    console.error('Drop failed:', err);
                    errorDiv.textContent = 'Could not load dropped file. Try using Choose Image instead.';
                    errorDiv.style.display = 'block';
                }
            }
        };

        const chooseBtn = document.getElementById('choose-btn');
        fileInput.onchange = updatePreview;
        function updatePreview() {
            const file = fileInput.files[0];
            if (!file) {
                preview.style.display = 'none';
                zoneText.style.display = 'block';
                chooseBtn.textContent = 'Choose Image';
                analyzeBtn.disabled = true;
                if (preview.src) URL.revokeObjectURL(preview.src);
                return;
            }
            if (preview.src) URL.revokeObjectURL(preview.src);
            preview.src = URL.createObjectURL(file);
            preview.style.display = 'block';
            zoneText.style.display = 'none';
            chooseBtn.textContent = 'Change Image';
            analyzeBtn.disabled = false;
            errorDiv.style.display = 'none';
            resultsDiv.style.display = 'none';
        }

        analyzeBtn.onclick = async () => {
            const file = fileInput.files[0];
            if (!file) {
                errorDiv.textContent = 'Please select an image first.';
                errorDiv.style.display = 'block';
                return;
            }
            analyzeBtn.disabled = true;
            loading.style.display = 'block';
            errorDiv.style.display = 'none';
            resultsDiv.style.display = 'none';

            const formData = new FormData();
            formData.append('image', file, file.name || 'image.jpg');

            try {
                const res = await fetch('/analyze', { method: 'POST', body: formData });
                let data;
                try { data = await res.json(); } catch (_) { data = {}; }
                if (!res.ok) {
                    let msg = 'Analysis failed';
                    if (data.detail) {
                        if (typeof data.detail === 'string') msg = data.detail;
                        else if (Array.isArray(data.detail) && data.detail.length) msg = data.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
                        else msg = JSON.stringify(data.detail);
                    }
                    throw new Error(msg);
                }

                resultImg.src = data.image_base64 || '';
                resultImg.alt = 'Annotated analysis result';
                regionsData = data.regions || {};
                imgW = data.image_width || 0;
                imgH = data.image_height || 0;
                overlaySvg.setAttribute('viewBox', '0 0 ' + imgW + ' ' + imgH);
                overlaySvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                clearHighlight();

                function formatVal(v) {
                    if (v === null || v === undefined) return '-';
                    if (typeof v === 'boolean') return String(v);
                    if (typeof v === 'number') return v % 1 === 0 ? v : Math.round(v * 100) / 100;
                    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '...' : v;
                    if (Array.isArray(v)) {
                        if (v.length === 0) return '[]';
                        if (v.length <= 4 && v.every(x => typeof x !== 'object' || x === null)) return JSON.stringify(v);
                        if (v.length > 8) return '[' + v.length + ' items]';
                        return JSON.stringify(v.slice(0, 4)) + (v.length > 4 ? '...' : '');
                    }
                    if (typeof v === 'object') return '{...}';
                    return String(v);
                }
                function keyToRegion(key) {
                    const k = key.toLowerCase().replace(/\\s/g, '_');
                    if (k.includes('face_rectangle') || k.includes('face.rectangle')) return 'face';
                    if (k.includes('dark_circle_mark') || k.includes('dark.circle.mark')) return 'dark_circle';
                    if (k.includes('brown_spot') || k.includes('brown.spot')) return 'brown_spot';
                    if (k.includes('closed_comedones') || k.includes('closed.comedones')) return 'blackhead';
                    if (k.includes('acne_mark') || k.includes('acne.mark')) return 'acne_mark';
                    if (k.includes('acne') && !k.includes('acne_mark')) return 'acne';
                    return '';
                }
                function getExplanation(fullKey) {
                    const k = fullKey.toLowerCase().replace(/\\s/g, '_');
                    const explanations = {
                        'face_rectangle': 'The bounding box around the detected face. Used to locate the face region for analysis.',
                        'skin_age': 'Estimated skin age based on visible signs like wrinkles, texture, and pigmentation. May differ from actual age.',
                        'score_info': 'Overall and category-specific scores (0-100). Higher is generally better for skin health.',
                        'total_score': 'Combined skin health score across all analyzed dimensions.',
                        'wrinkle': 'Wrinkle severity score. Measures forehead lines, crow\'s feet, fine lines, and nasolabial folds.',
                        'pores': 'Pore visibility and enlargement score. Larger pores appear more prominent.',
                        'blackhead': 'Blackhead (open comedones) severity. Clogged pores with oxidized sebum.',
                        'acne': 'Active acne severity: papules, pustules, nodules. Inflamed blemishes on the skin.',
                        'acne_mark': 'Acne marks or post-inflammatory hyperpigmentation left after acne heals.',
                        'dark_circle': 'Dark circles under the eyes. Can be vascular, pigmented, or structural.',
                        'brown_spot': 'Brown spots (sun spots, age spots). Areas of increased pigmentation.',
                        'closed_comedones': 'Closed comedones (whiteheads). Small bumps from clogged pores.',
                        'skin_type': 'Skin type: Oily, Dry, Normal, or Combination. Affects product recommendations.',
                        'skin_tone': 'Skin color classification: Translucent White, Fair, Natural, Wheatish, or Dark.',
                        'skin_undertone': 'Underlying skin tone: warm, cool, or neutral. Affects color matching.',
                        'sensitivity': 'Skin sensitivity level and areas. Red zones indicate irritation or sensitivity.',
                        'eye_bag': 'Puffiness or bags under the eyes. Can be due to fluid retention or aging.',
                        'pigmentation': 'Overall skin pigmentation level. Uneven tone or dark patches.',
                        'mole': 'Detected moles. Location and count for monitoring.',
                        'glabellar': 'Lines between the eyebrows (frown lines).',
                        'nasolabial': 'Nasolabial folds: lines from nose to mouth corners.',
                        'forehead': 'Forehead wrinkles or lines.',
                        'crow': 'Crow\'s feet: fine lines around the outer corners of the eyes.',
                        'fine_line': 'Fine lines, often under the eyes or on the forehead.',
                        'texture': 'Skin texture: smoothness, roughness, or unevenness.',
                        'oil': 'Oiliness level. Affects shine and pore appearance.',
                        'moisture': 'Skin moisture or hydration level.',
                        'left_eye_rect': 'Left eye region for dark circle analysis.',
                        'right_eye_rect': 'Right eye region for dark circle analysis.',
                        'rectangle': 'Bounding box coordinates of the detected region.',
                        'left': 'Left coordinate (X) of the bounding box.',
                        'top': 'Top coordinate (Y) of the bounding box.',
                        'width': 'Width of the detected region in pixels.',
                        'height': 'Height of the detected region in pixels.',
                        'count': 'Number of detected items (e.g., spots, acne lesions).',
                        'value': 'Numeric value for this parameter.',
                        'severity': 'Severity level (e.g., mild, moderate, severe).',
                        'error_code': 'API response code. 0 means success.',
                        'request_id': 'Unique request identifier for support.',
                    };
                    for (const [pattern, explanation] of Object.entries(explanations)) {
                        if (k.includes(pattern)) return explanation;
                    }
                    return 'This parameter is part of the skin analysis result. See the full documentation for details.';
                }
                function flattenObj(obj, prefix) {
                    const out = [];
                    if (!obj || typeof obj !== 'object') return out;
                    for (const k of Object.keys(obj).sort()) {
                        const fullKey = prefix ? prefix + '.' + k : k;
                        const v = obj[k];
                        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                            out.push(...flattenObj(v, fullKey));
                        } else {
                            const displayKey = fullKey.replace(/_/g, ' ').replace(/\\./g, ' > ').replace(/\\b\\w/g, function(c){ return c.toUpperCase(); });
                            out.push({ key: displayKey, value: formatVal(v), region: keyToRegion(fullKey), fullKey: fullKey });
                        }
                    }
                    return out;
                }
                function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
                const allParams = flattenObj(data.metrics || {}, '');
                metricsDiv.innerHTML = allParams.map((p, i) => {
                    const hl = p.region && regionsData[p.region] ? 'highlightable' : 'non-highlightable';
                    const region = p.region || '';
                    const explain = esc(getExplanation(p.fullKey));
                    return '<div class="metric-item"><div class="metric-row" data-region="' + esc(region) + '"><div class="row-content"><span class="key ' + hl + '">' + esc(p.key) + '</span><span class="val">' + esc(p.value) + '</span></div></div><div class="metric-arrow" data-idx="' + i + '" title="Learn more">&#9660;</div><div class="metric-explain" data-idx="' + i + '">' + explain + '</div></div>';
                }).join('');

                metricsDiv.querySelectorAll('.metric-row').forEach(row => {
                    row.onclick = (e) => {
                        if (e.target.closest('.metric-arrow')) return;
                        metricsDiv.querySelectorAll('.metric-row').forEach(r => r.classList.remove('active'));
                        const region = row.dataset.region;
                        if (region && regionsData[region]) {
                            row.classList.add('active');
                            drawHighlight(region);
                        } else {
                            clearHighlight();
                        }
                    };
                });
                metricsDiv.querySelectorAll('.metric-arrow').forEach(arrow => {
                    arrow.onclick = (e) => {
                        e.stopPropagation();
                        const idx = arrow.dataset.idx;
                        const explain = metricsDiv.querySelector('.metric-explain[data-idx="' + idx + '"]');
                        const isOpen = explain.classList.contains('show');
                        metricsDiv.querySelectorAll('.metric-explain').forEach(el => el.classList.remove('show'));
                        metricsDiv.querySelectorAll('.metric-arrow').forEach(el => el.classList.remove('expanded'));
                        if (!isOpen) {
                            explain.classList.add('show');
                            arrow.classList.add('expanded');
                        }
                    };
                });
                rawPre.textContent = JSON.stringify(data, null, 2).slice(0, 5000);
                resultsDiv.style.display = 'block';
            } catch (err) {
                errorDiv.textContent = err instanceof Error ? err.message : String(err);
                errorDiv.style.display = 'block';
            } finally {
                loading.style.display = 'none';
                analyzeBtn.disabled = false;
            }
        };
    </script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
def root():
    return UPLOAD_HTML


@app.post("/analyze")
async def analyze(image: UploadFile = File(..., description="Image file (JPEG/PNG)")):
    """Accept image upload, run skin analysis, return metrics and annotated image."""
    logger.info("=== INCOMING REQUEST ===")
    logger.info("Filename: %s | Content-Type: %s", image.filename, image.content_type)

    if image.content_type and not image.content_type.startswith("image/"):
        logger.warning("Rejected: not an image (content-type: %s)", image.content_type)
        raise HTTPException(status_code=400, detail="File must be an image (JPEG or PNG)")

    try:
        image_bytes = await image.read()
    except Exception as e:
        logger.error("Failed to read file: %s", e)
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    logger.info("Received image: %d bytes", len(image_bytes))

    if len(image_bytes) == 0:
        logger.warning("Rejected: empty file")
        raise HTTPException(status_code=400, detail="Empty file")

    result = run_analysis(image_bytes)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))

    return {
        "metrics": result["metrics"],
        "image_base64": result["image_base64"],
        "regions": result.get("regions", {}),
        "image_width": result.get("image_width"),
        "image_height": result.get("image_height"),
    }
