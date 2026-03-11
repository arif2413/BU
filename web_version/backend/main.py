"""
FastAPI backend for skin analysis - accepts image upload, returns metrics + annotated image.
Saves each analysis (image + JSON results) for before/after comparison.
Serves the Web_app/ frontend as static files.
"""
import os
import json
import logging
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .analyzer import run_analysis
from io import BytesIO
from typing import Dict

from PIL import Image

load_dotenv()

app = FastAPI(title="Skin Analysis API")

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


COMPARE_KEYS = [
    "result.skin_age",
    "result.skin_type.skin_type",
    "result.skin_color.skin_color_name",
    "result.skin_color.ita_name",
    "result.skin_color.ha_name",
    "result.score_info.total_score",
    "result.score_info.wrinkle_score",
    "result.score_info.pores_score",
    "result.score_info.blackhead_score",
    "result.score_info.acne_score",
    "result.score_info.dark_circle_score",
    "result.score_info.sensitivity_score",
    "result.score_info.brown_spot_score",
    "result.score_info.closed_comedones_score",
    "result.score_info.eye_bag_score",
    "result.score_info.pigmentation_score",
    "result.score_info.mole_score",
    "result.score_info.texture_score",
    "result.score_info.oil_score",
    "result.score_info.moisture_score",
    "result.acne.count",
    "result.acne_mark.count",
    "result.brown_spot.count",
    "result.closed_comedones.count",
    "result.mole.count",
    "result.blackhead.count",
    "result.blackhead.severity",
    "result.sensitivity.area_percentage",
    "result.sensitivity.intensity",
    "result.dark_circle_mark.left_dark_circle_severity",
    "result.dark_circle_mark.right_dark_circle_severity",
    "result.dark_circle_mark.left_dark_circle_type_name",
    "result.dark_circle_mark.right_dark_circle_type_name",
    "result.eye_bag.severity",
    "result.forehead_wrinkle.severity",
    "result.left_nasolabial_fold.severity",
    "result.right_nasolabial_fold.severity",
    "result.left_crows_feet.severity",
    "result.right_crows_feet.severity",
    "result.left_eye_finelines.severity",
    "result.right_eye_finelines.severity",
    "result.glabellar_wrinkle.severity",
    "result.pores_forehead.severity",
    "result.pores_left_cheek.severity",
    "result.pores_right_cheek.severity",
    "result.pores_chin.severity",
    "result.skin_type.oily_severity",
]

COMPARE_LABELS = {
    "result.skin_age": "Skin Age",
    "result.skin_type.skin_type": "Skin Type",
    "result.skin_color.skin_color_name": "Skin Color",
    "result.skin_color.ita_name": "Skin Color (ITA)",
    "result.skin_color.ha_name": "Skin Tone (HA)",
    "result.score_info.total_score": "Total Score",
    "result.score_info.wrinkle_score": "Wrinkle Score",
    "result.score_info.pores_score": "Pores Score",
    "result.score_info.blackhead_score": "Blackhead Score",
    "result.score_info.acne_score": "Acne Score",
    "result.score_info.dark_circle_score": "Dark Circle Score",
    "result.score_info.sensitivity_score": "Sensitivity Score",
    "result.score_info.brown_spot_score": "Brown Spot Score",
    "result.score_info.closed_comedones_score": "Comedones Score",
    "result.score_info.eye_bag_score": "Eye Bag Score",
    "result.score_info.pigmentation_score": "Pigmentation Score",
    "result.score_info.mole_score": "Mole Score",
    "result.score_info.texture_score": "Texture Score",
    "result.score_info.oil_score": "Oil Score",
    "result.score_info.moisture_score": "Moisture Score",
    "result.acne.count": "Acne Count",
    "result.acne_mark.count": "Acne Marks Count",
    "result.brown_spot.count": "Brown Spots Count",
    "result.closed_comedones.count": "Comedones Count",
    "result.mole.count": "Mole Count",
    "result.blackhead.count": "Blackhead Count",
    "result.blackhead.severity": "Blackhead Severity",
    "result.sensitivity.area_percentage": "Sensitivity Area %",
    "result.sensitivity.intensity": "Sensitivity Intensity",
    "result.dark_circle_mark.left_dark_circle_severity": "Dark Circle Severity (Left)",
    "result.dark_circle_mark.right_dark_circle_severity": "Dark Circle Severity (Right)",
    "result.dark_circle_mark.left_dark_circle_type_name": "Dark Circle Type (Left)",
    "result.dark_circle_mark.right_dark_circle_type_name": "Dark Circle Type (Right)",
    "result.eye_bag.severity": "Eye Bag Severity",
    "result.forehead_wrinkle.severity": "Forehead Wrinkle Severity",
    "result.left_nasolabial_fold.severity": "Nasolabial Fold Severity (Left)",
    "result.right_nasolabial_fold.severity": "Nasolabial Fold Severity (Right)",
    "result.left_crows_feet.severity": "Crow's Feet Severity (Left)",
    "result.right_crows_feet.severity": "Crow's Feet Severity (Right)",
    "result.left_eye_finelines.severity": "Eye Fine Lines Severity (Left)",
    "result.right_eye_finelines.severity": "Eye Fine Lines Severity (Right)",
    "result.glabellar_wrinkle.severity": "Glabellar Wrinkle Severity",
    "result.pores_forehead.severity": "Pore Severity (Forehead)",
    "result.pores_left_cheek.severity": "Pore Severity (Left Cheek)",
    "result.pores_right_cheek.severity": "Pore Severity (Right Cheek)",
    "result.pores_chin.severity": "Pore Severity (Chin)",
    "result.skin_type.oily_severity": "Oiliness Severity",
}

COMPARE_CATEGORIES = {
    "result.skin_age": "Skin Properties",
    "result.skin_type.skin_type": "Skin Properties",
    "result.skin_color.skin_color_name": "Skin Properties",
    "result.skin_color.ita_name": "Skin Properties",
    "result.skin_color.ha_name": "Skin Properties",
    "result.skin_type.oily_severity": "Skin Properties",
    "result.score_info.total_score": "Scores",
    "result.score_info.wrinkle_score": "Scores",
    "result.score_info.pores_score": "Scores",
    "result.score_info.blackhead_score": "Scores",
    "result.score_info.acne_score": "Scores",
    "result.score_info.dark_circle_score": "Scores",
    "result.score_info.sensitivity_score": "Scores",
    "result.score_info.brown_spot_score": "Scores",
    "result.score_info.closed_comedones_score": "Scores",
    "result.score_info.eye_bag_score": "Scores",
    "result.score_info.pigmentation_score": "Scores",
    "result.score_info.mole_score": "Scores",
    "result.score_info.texture_score": "Scores",
    "result.score_info.oil_score": "Scores",
    "result.score_info.moisture_score": "Scores",
    "result.acne.count": "Counts",
    "result.acne_mark.count": "Counts",
    "result.brown_spot.count": "Counts",
    "result.closed_comedones.count": "Counts",
    "result.mole.count": "Counts",
    "result.blackhead.count": "Counts",
    "result.blackhead.severity": "Severity",
    "result.sensitivity.area_percentage": "Sensitivity",
    "result.sensitivity.intensity": "Sensitivity",
    "result.dark_circle_mark.left_dark_circle_severity": "Eye Area",
    "result.dark_circle_mark.right_dark_circle_severity": "Eye Area",
    "result.dark_circle_mark.left_dark_circle_type_name": "Eye Area",
    "result.dark_circle_mark.right_dark_circle_type_name": "Eye Area",
    "result.eye_bag.severity": "Eye Area",
    "result.forehead_wrinkle.severity": "Wrinkles",
    "result.left_nasolabial_fold.severity": "Wrinkles",
    "result.right_nasolabial_fold.severity": "Wrinkles",
    "result.left_crows_feet.severity": "Wrinkles",
    "result.right_crows_feet.severity": "Wrinkles",
    "result.left_eye_finelines.severity": "Wrinkles",
    "result.right_eye_finelines.severity": "Wrinkles",
    "result.glabellar_wrinkle.severity": "Wrinkles",
    "result.pores_forehead.severity": "Pores",
    "result.pores_left_cheek.severity": "Pores",
    "result.pores_right_cheek.severity": "Pores",
    "result.pores_chin.severity": "Pores",
}

HIGHER_IS_BETTER = {
    "result.score_info.total_score",
    "result.score_info.wrinkle_score",
    "result.score_info.pores_score",
    "result.score_info.blackhead_score",
    "result.score_info.acne_score",
    "result.score_info.dark_circle_score",
    "result.score_info.sensitivity_score",
    "result.score_info.brown_spot_score",
    "result.score_info.closed_comedones_score",
    "result.score_info.eye_bag_score",
    "result.score_info.pigmentation_score",
    "result.score_info.mole_score",
    "result.score_info.texture_score",
    "result.score_info.oil_score",
    "result.score_info.moisture_score",
}

LOWER_IS_BETTER = {
    "result.skin_age",
    "result.acne.count",
    "result.acne_mark.count",
    "result.brown_spot.count",
    "result.closed_comedones.count",
    "result.blackhead.count",
    "result.sensitivity.area_percentage",
    "result.sensitivity.intensity",
}


def _compute_lighting_metrics(image_bytes: bytes) -> Dict[str, float]:
    """Compute simple lighting statistics for an RGB image."""
    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Lighting analysis failed to open image: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid image data for lighting check")

    # Downscale aggressively for speed
    img = img.resize((64, 64))
    pixels = list(img.getdata())
    n = len(pixels) or 1

    total = 0.0
    total_sq = 0.0
    dark = 0
    bright = 0

    for r, g, b in pixels:
        y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        norm = y / 255.0
        total += norm
        total_sq += norm * norm
        if norm < 0.2:
            dark += 1
        elif norm > 0.9:
            bright += 1

    mean = total / n
    variance = max(total_sq / n - mean * mean, 0.0)
    std = variance ** 0.5
    dark_frac = dark / n
    bright_frac = bright / n

    return {
        "mean_brightness": round(mean, 4),
        "contrast": round(std, 4),
        "dark_fraction": round(dark_frac, 4),
        "bright_fraction": round(bright_frac, 4),
    }


def _classify_lighting(metrics: Dict[str, float]) -> Dict[str, str]:
    """Classify lighting using the same heuristic as the frontend."""
    mean = metrics.get("mean_brightness", 0.0)
    std = metrics.get("contrast", 0.0)
    dark_frac = metrics.get("dark_fraction", 0.0)
    bright_frac = metrics.get("bright_fraction", 0.0)

    if mean < 0.22 or dark_frac > 0.55:
        return {
            "level": "poor",
            "message": "Lighting is too dark. Move to brighter, even light.",
        }
    if mean > 0.93 or bright_frac > 0.55:
        return {
            "level": "poor",
            "message": "Lighting is too bright or backlit. Avoid strong glare.",
        }
    if std < 0.06:
        return {
            "level": "fair",
            "message": "Lighting is flat. Try adding a bit more contrast.",
        }
    return {
        "level": "good",
        "message": "Lighting is suitable.",
    }


def _get_nested(obj, dotted_key):
    """Safely traverse a nested dict by dotted key."""
    parts = dotted_key.split(".")
    cur = obj
    for p in parts:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur


def _judge_change(key, before_val, after_val):
    """Return 'improved', 'worsened', 'unchanged', or 'changed'."""
    if before_val == after_val:
        return "unchanged"
    if not isinstance(before_val, (int, float)) or not isinstance(after_val, (int, float)):
        return "changed"
    if key in HIGHER_IS_BETTER:
        return "improved" if after_val > before_val else "worsened"
    if key in LOWER_IS_BETTER:
        return "improved" if after_val < before_val else "worsened"
    return "changed"


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

    analysis_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = Path(image.filename).suffix if image.filename else ".jpg"
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    img_path = UPLOADS_DIR / f"{analysis_id}{ext}"
    try:
        img_path.write_bytes(image_bytes)
        logger.info("Saved upload to %s", img_path)
    except Exception as e:
        logger.warning("Could not save upload: %s", e)

    result = run_analysis(image_bytes)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))

    record = {
        "id": analysis_id,
        "timestamp": datetime.now().isoformat(),
        "image_file": img_path.name,
        "metrics": result["metrics"],
        "image_base64": result["image_base64"],
    }
    json_path = UPLOADS_DIR / f"{analysis_id}.json"
    try:
        json_path.write_text(json.dumps(record, default=str), encoding="utf-8")
        logger.info("Saved analysis JSON to %s", json_path)
    except Exception as e:
        logger.warning("Could not save analysis JSON: %s", e)

    return {
        "id": analysis_id,
        "metrics": result["metrics"],
        "image_base64": result["image_base64"],
        "regions": result.get("regions", {}),
        "image_width": result.get("image_width"),
        "image_height": result.get("image_height"),
    }


@app.post("/check-lighting")
async def check_lighting(image: UploadFile = File(..., description="Image file (JPEG/PNG/WebP for lighting check)")):
    """
    Quick lighting-quality analysis for a given image.

    Returns mean brightness, contrast and an overall classification (good/fair/poor).
    """
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        image_bytes = await image.read()
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Failed to read lighting check image: %s", exc)
        raise HTTPException(status_code=400, detail="Failed to read file for lighting check")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    metrics = _compute_lighting_metrics(image_bytes)
    classification = _classify_lighting(metrics)
    return {"metrics": metrics, "classification": classification}


@app.get("/history")
def history():
    """List all past analyses, newest first."""
    entries = []
    for jf in sorted(UPLOADS_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            entries.append({
                "id": data.get("id", jf.stem),
                "timestamp": data.get("timestamp", ""),
                "image_file": data.get("image_file", ""),
            })
        except Exception:
            continue
    return entries


@app.get("/history/{analysis_id}/thumb")
def history_thumb(analysis_id: str):
    """Return the original uploaded image for a given analysis."""
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        path = UPLOADS_DIR / f"{analysis_id}{ext}"
        if path.exists():
            media = "image/jpeg" if ext in (".jpg", ".jpeg") else f"image/{ext.lstrip('.')}"
            return FileResponse(path, media_type=media)
    raise HTTPException(status_code=404, detail="Image not found")


@app.get("/history/{analysis_id}/data")
def history_data(analysis_id: str):
    """Return stored analysis data (metrics only, no base64 image)."""
    json_path = UPLOADS_DIR / f"{analysis_id}.json"
    if not json_path.exists():
        raise HTTPException(status_code=404, detail="Analysis not found")
    data = json.loads(json_path.read_text(encoding="utf-8"))
    data.pop("image_base64", None)
    return data


@app.get("/compare/{before_id}/{after_id}")
def compare(before_id: str, after_id: str):
    """Compare two analyses, returning meaningful parameter differences."""
    before_path = UPLOADS_DIR / f"{before_id}.json"
    after_path = UPLOADS_DIR / f"{after_id}.json"

    if not before_path.exists():
        raise HTTPException(status_code=404, detail=f"Analysis '{before_id}' not found")
    if not after_path.exists():
        raise HTTPException(status_code=404, detail=f"Analysis '{after_id}' not found")

    before_data = json.loads(before_path.read_text(encoding="utf-8"))
    after_data = json.loads(after_path.read_text(encoding="utf-8"))
    before_metrics = before_data.get("metrics", {})
    after_metrics = after_data.get("metrics", {})

    comparisons = []
    for key in COMPARE_KEYS:
        bv = _get_nested(before_metrics, key)
        av = _get_nested(after_metrics, key)
        if bv is None and av is None:
            continue
        label = COMPARE_LABELS.get(key, key)

        def fmt(v):
            if v is None:
                return "-"
            if isinstance(v, float):
                return round(v, 2)
            return v

        verdict = _judge_change(key, bv, av)
        is_numeric = isinstance(bv, (int, float)) or isinstance(av, (int, float))
        if key in HIGHER_IS_BETTER:
            direction = "higher_is_better"
        elif key in LOWER_IS_BETTER:
            direction = "lower_is_better"
        else:
            direction = "neutral"
        comparisons.append({
            "key": key,
            "label": label,
            "before": fmt(bv),
            "after": fmt(av),
            "verdict": verdict,
            "category": COMPARE_CATEGORIES.get(key, "Other"),
            "numeric": is_numeric,
            "direction": direction,
        })

    return {
        "before": {"id": before_id, "timestamp": before_data.get("timestamp", "")},
        "after": {"id": after_id, "timestamp": after_data.get("timestamp", "")},
        "comparisons": comparisons,
    }


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "Web_app"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    logger.warning("Frontend directory not found at %s", FRONTEND_DIR)
