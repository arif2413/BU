"""
Skin analysis module - calls AILab Skin Analysis Pro API and generates annotated visualization.
API: https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-pro
"""
import os
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass
import io
import base64
import requests
from PIL import Image, ImageDraw, ImageFont

SKIN_ANALYSIS_PRO_URL = "https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro"


def _get_jpeg_bytes(image_bytes: bytes) -> bytes:
    """Convert image bytes to JPEG (API only accepts JPEG/JPG)."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    jpeg_buffer = io.BytesIO()
    img.save(jpeg_buffer, format="JPEG", quality=95)
    jpeg_buffer.seek(0)
    return jpeg_buffer.read()


def analyze_skin(image_bytes: bytes, api_key: str) -> dict:
    """
    Call AILab Skin Analysis Pro API.
    Returns raw API response dict.
    """
    jpeg_data = _get_jpeg_bytes(image_bytes)
    files = {"image": ("image.jpg", jpeg_data, "image/jpeg")}
    headers = {"ailabapi-api-key": api_key}
    response = requests.post(SKIN_ANALYSIS_PRO_URL, data={}, files=files, headers=headers)
    return response.json()


def create_annotated_image(api_response: dict, image_bytes: bytes) -> bytes:
    """
    Create composite image with skin annotations and full JSON metrics panel.
    Returns PNG bytes.
    """
    if api_response.get("error_code", 0) != 0:
        raise ValueError(api_response.get("error_msg", "API error"))

    r = api_response.get("result", {})
    face_rect = api_response.get("face_rectangle", {})

    vis_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(vis_img)
    w, h = vis_img.size

    try:
        font = ImageFont.truetype("arial.ttf", min(24, w // 40))
        font_sm = ImageFont.truetype("arial.ttf", min(18, w // 55))
    except Exception:
        font = ImageFont.load_default()
        font_sm = font

    COLORS = {
        "face": (0, 255, 255),
        "dark_circle": (128, 0, 128),
        "brown_spot": (139, 90, 43),
        "comedone": (255, 255, 0),
        "acne_mark": (255, 0, 0),
    }

    def draw_rect(rect_dict, color, label=None, width=3):
        if not rect_dict:
            return
        x1 = rect_dict.get("left", 0)
        y1 = rect_dict.get("top", 0)
        x2 = x1 + rect_dict.get("width", 0)
        y2 = y1 + rect_dict.get("height", 0)
        for i in range(width):
            draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)
        if label:
            draw.text((x1, y1 - 22), label, fill=color, font=font_sm)

    # 1. Face rectangle
    if face_rect:
        draw_rect(face_rect, COLORS["face"], "Face", width=4)

    # 2. Dark circle / eye pouch regions
    dcm = r.get("dark_circle_mark", {})
    if dcm:
        draw_rect(dcm.get("left_eye_rect"), COLORS["dark_circle"], "Dark circle (L)", width=2)
        draw_rect(dcm.get("right_eye_rect"), COLORS["dark_circle"], "Dark circle (R)", width=2)

    # 3. Brown spots
    for rect in r.get("brown_spot", {}).get("rectangle", []):
        draw_rect(rect, COLORS["brown_spot"], width=2)

    # 4. Closed comedones
    for rect in r.get("closed_comedones", {}).get("rectangle", []):
        draw_rect(rect, COLORS["comedone"], width=2)

    # 5. Acne marks
    for rect in r.get("acne_mark", {}).get("rectangle", []):
        draw_rect(rect, COLORS["acne_mark"], width=2)

    # 6. Acne
    for rect in r.get("acne", {}).get("rectangle", []):
        draw_rect(rect, COLORS["acne_mark"], width=2)

    # Legend
    legend_y = h - 50
    draw.rectangle([0, legend_y, w, h], fill=(30, 30, 30))
    draw.text(
        (15, legend_y + 12),
        "Cyan: Face | Purple: Dark circles | Brown: Brown spots | Yellow: Comedones | Red: Acne",
        fill=(255, 255, 255),
        font=font_sm,
    )

    # Composite: image + metrics panel (all JSON on right)
    panel_w = min(580, w)
    line_h = 14
    composite_w = w + panel_w
    composite_h = max(h, 1200)
    composite = Image.new("RGB", (composite_w, composite_h), (25, 25, 25))
    composite.paste(vis_img, (0, 0))

    draw_panel = ImageDraw.Draw(composite)
    try:
        font_panel = ImageFont.truetype("arial.ttf", 12)
        font_title = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font_panel = ImageFont.load_default()
        font_title = font_panel

    def add_section(title, items, y_start):
        draw_panel.text((w + 12, y_start), title, fill=(100, 200, 255), font=font_title)
        y_start += 20
        for k, v in items:
            val_str = str(v)[:50] + ("..." if len(str(v)) > 50 else "")
            draw_panel.text((w + 12, y_start), f"  {k}", fill=(200, 200, 200), font=font_panel)
            draw_panel.text((w + panel_w - 130, y_start), val_str, fill=(255, 255, 255), font=font_panel)
            y_start += line_h
        return y_start + 6

    def format_val(v):
        if v is None:
            return "-"
        if isinstance(v, bool):
            return str(v)
        if isinstance(v, (int, float)):
            return round(v, 2) if isinstance(v, float) else v
        if isinstance(v, str):
            return v[:50] + ("..." if len(v) > 50 else "")
        if isinstance(v, list):
            if len(v) == 0:
                return "[]"
            if len(v) <= 4 and all(not isinstance(x, (list, dict)) for x in v):
                return str(v)
            if len(v) > 10:
                return f"[{len(v)} items]"
            return str(v[:5]) + ("..." if len(v) > 5 else "")
        if isinstance(v, dict):
            return "{...}"
        return str(v)

    def flatten(obj, prefix=""):
        items = []
        if isinstance(obj, dict):
            for k, v in sorted(obj.items()):
                key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    items.extend(flatten(v, key))
                elif isinstance(v, list) and v and isinstance(v[0], (dict, list)):
                    items.append((key.replace("_", " ").title(), format_val(v)))
                else:
                    items.append((key.replace("_", " ").title(), format_val(v)))
        return items

    # Build full list: top-level + face_rectangle + result (flattened) + error_detail
    all_items = []
    for key in ["error_code", "error_msg", "request_id", "log_id"]:
        if key in api_response:
            all_items.append((key.replace("_", " ").title(), format_val(api_response[key])))
    if face_rect:
        all_items.extend(flatten({"face_rectangle": face_rect}))
    all_items.extend(flatten(api_response.get("result", {})))
    if "error_detail" in api_response:
        all_items.extend(flatten(api_response["error_detail"], "error_detail"))

    y = 12
    y = add_section("FULL JSON RESPONSE (all parameters)", all_items, y)

    # Build regions for interactive highlighting (metric_key -> list of {left, top, width, height})
    def rect_to_dict(rect):
        if not rect or not isinstance(rect, dict):
            return None
        return {
            "left": rect.get("left", 0),
            "top": rect.get("top", 0),
            "width": rect.get("width", 0),
            "height": rect.get("height", 0),
        }

    regions = {}
    if face_rect:
        regions["face"] = [rect_to_dict(face_rect)]
    dcm = r.get("dark_circle_mark", {})
    dark_rects = []
    for key in ("left_eye_rect", "right_eye_rect"):
        dr = rect_to_dict(dcm.get(key))
        if dr:
            dark_rects.append(dr)
    if dark_rects:
        regions["dark_circle"] = dark_rects

    eye_pouch_rects = []
    for key in ("left_eye_pouch_rect", "right_eye_pouch_rect"):
        ep = rect_to_dict(r.get(key))
        if ep:
            eye_pouch_rects.append(ep)
    if eye_pouch_rects:
        regions["eye_pouch"] = eye_pouch_rects

    for key, region_key in [
        ("brown_spot", "brown_spot"),
        ("closed_comedones", "blackhead"),
        ("acne_mark", "acne_mark"),
        ("acne", "acne"),
        ("mole", "mole"),
        ("acne_nodule", "acne_nodule"),
        ("acne_pustule", "acne_pustule"),
    ]:
        rects = [rect_to_dict(x) for x in r.get(key, {}).get("rectangle", [])]
        rects = [x for x in rects if x]
        if rects:
            regions[region_key] = rects

    # Return face-only image (for interactive display) + regions
    face_buffer = io.BytesIO()
    vis_img.save(face_buffer, format="PNG")
    face_buffer.seek(0)
    return face_buffer.read(), regions, w, h


def run_analysis(image_bytes: bytes) -> dict:
    """
    Full analysis pipeline: call Skin Analysis Pro API and create annotated image.
    Returns {"success": True, "metrics": {...}, "image_base64": "..."} or
            {"success": False, "error": "..."}
    """
    api_key = os.environ.get("AILABAPI_API_KEY")
    if not api_key:
        return {"success": False, "error": "AILABAPI_API_KEY not configured"}

    try:
        api_response = analyze_skin(image_bytes, api_key)
    except Exception as e:
        return {"success": False, "error": str(e)}

    if api_response.get("error_code", 0) != 0:
        return {
            "success": False,
            "error": api_response.get("error_msg", "API error"),
        }

    try:
        face_bytes, regions, img_w, img_h = create_annotated_image(api_response, image_bytes)
        image_base64 = base64.b64encode(face_bytes).decode("utf-8")
    except Exception as e:
        return {"success": False, "error": f"Visualization failed: {e}"}

    return {
        "success": True,
        "metrics": api_response,
        "image_base64": f"data:image/png;base64,{image_base64}",
        "regions": regions,
        "image_width": img_w,
        "image_height": img_h,
    }
