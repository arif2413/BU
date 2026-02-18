import requests
from PIL import Image, ImageDraw, ImageFont
import io
import json

url = "https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro"

# Use image from 00000 folder (API requires JPEG, so convert PNG if needed)
image_path = r"C:\Users\ajahangir\Pictures\BU\00000\00001.png"

# Load and convert to JPEG (API only accepts JPEG/JPG)
img = Image.open(image_path)
if img.mode in ("RGBA", "P"):
    img = img.convert("RGB")
jpeg_buffer = io.BytesIO()
img.save(jpeg_buffer, format="JPEG", quality=95)
jpeg_buffer.seek(0)

files = {
    "image": ("00000.jpg", jpeg_buffer, "image/jpeg")
}

# Optional parameters - use empty or omit if API expects different format
payload = {}

headers = {"ailabapi-api-key": "IUnRk1bTqCDsDhn6IWuke1OeKwu6dY9ghzAMBdp53PyWZlsAUGm2cPBYxaR8j7Nt"}

response = requests.post(url, data=payload, files=files, headers=headers)
data = response.json()

# Print raw JSON if error
if data.get("error_code", 0) != 0:
    print(response.text)
else:
    r = data.get("result", {})
    s = r.get("score_info", {})

    # Table 1: Main metrics
    print("\n" + "=" * 60)
    print("SKIN ANALYSIS RESULTS - MAIN METRICS")
    print("=" * 60)
    print(f"{'Metric':<35} {'Value':<20}")
    print("-" * 60)
    print(f"{'Skin Age':<35} {r.get('skin_age', {}).get('value', '-'):<20}")
    print(f"{'Skin Type':<35} {r.get('skin_type', {}).get('skin_type', '-'):<20}")
    print(f"{'Skin Tone (ITA)':<35} {r.get('skintone_ita', {}).get('ITA', '-'):<20}")
    print(f"{'Skin Hue':<35} {r.get('skin_hue_ha', {}).get('skin_hue', '-'):<20}")

    # Table 2: Score summary
    print("\n" + "=" * 60)
    print("SCORE SUMMARY (0-100, higher = better)")
    print("=" * 60)
    print(f"{'Score':<35} {'Value':<20}")
    print("-" * 60)
    print(f"{'Total Score':<35} {s.get('total_score', '-'):<20}")
    print(f"{'Wrinkle Score':<35} {s.get('wrinkle_score', '-'):<20}")
    print(f"{'Pores Score':<35} {s.get('pores_score', '-'):<20}")
    print(f"{'Blackhead Score':<35} {s.get('blackhead_score', '-'):<20}")
    print(f"{'Acne Score':<35} {s.get('acne_score', '-'):<20}")
    print(f"{'Dark Circle Score':<35} {s.get('dark_circle_score', '-'):<20}")
    print(f"{'Skin Type Score':<35} {s.get('skin_type_score', '-'):<20}")
    print(f"{'Water Score':<35} {s.get('water_score', '-'):<20}")
    print(f"{'Roughness Score':<35} {s.get('rough_score', '-'):<20}")
    print(f"{'Melanin Score':<35} {s.get('melanin_score', '-'):<20}")
    print(f"{'Sensitivity Score':<35} {s.get('sensitivity_score', '-'):<20}")
    print(f"{'Red Spot Score':<35} {s.get('red_spot_score', '-'):<20}")

    # Table 3: Counts
    print("\n" + "=" * 60)
    print("COUNTS")
    print("=" * 60)
    print(f"{'Item':<35} {'Count':<20}")
    print("-" * 60)
    print(f"{'Blackhead Count':<35} {r.get('blackhead_count', '-'):<20}")
    print(f"{'Brown Spots':<35} {r.get('brown_spot', {}).get('count', '-'):<20}")
    print(f"{'Acne':<35} {r.get('acne', {}).get('count', '-'):<20}")
    print(f"{'Closed Comedones':<35} {r.get('closed_comedones', {}).get('count', '-'):<20}")
    print(f"{'Acne Marks':<35} {r.get('acne_mark', {}).get('count', '-'):<20}")
    print(f"{'Moles':<35} {r.get('mole', {}).get('count', '-'):<20}")

    # Table 4: Wrinkle counts by area
    wc = r.get("wrinkle_count", {})
    print("\n" + "=" * 60)
    print("WRINKLE COUNTS BY AREA")
    print("=" * 60)
    print(f"{'Area':<35} {'Count':<20}")
    print("-" * 60)
    for key, val in wc.items():
        print(f"{key.replace('_', ' ').title():<35} {val:<20}")

    # Table 5: Enlarged pore counts
    epc = r.get("enlarged_pore_count", {})
    print("\n" + "=" * 60)
    print("ENLARGED PORE COUNTS")
    print("=" * 60)
    print(f"{'Area':<35} {'Count':<20}")
    print("-" * 60)
    for key, val in epc.items():
        print(f"{key.replace('_', ' ').title():<35} {val:<20}")

    # Table 6: Severity levels
    print("\n" + "=" * 60)
    print("SEVERITY LEVELS (0=min, 3=max)")
    print("=" * 60)
    print(f"{'Condition':<35} {'Severity':<20}")
    print("-" * 60)
    for key in ["dark_circle_severity", "eye_pouch_severity", "forehead_wrinkle_severity",
                "left_crows_feet_severity", "right_crows_feet_severity", "left_eye_finelines_severity",
                "right_eye_finelines_severity", "glabella_wrinkle_severity", "left_nasolabial_fold_severity",
                "right_nasolabial_fold_severity"]:
        val = r.get(key, {})
        if isinstance(val, dict):
            val = val.get("value", val.get("confidence", "-"))
        print(f"{key.replace('_', ' ').title():<35} {val:<20}")

    # Draw results on the input image
    vis_img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(vis_img)
    w, h = vis_img.size

    # Try to use a nice font, fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", min(24, w // 40))
        font_sm = ImageFont.truetype("arial.ttf", min(18, w // 55))
    except Exception:
        font = ImageFont.load_default()
        font_sm = font

    # Colors (R, G, B)
    COLORS = {
        "face": (0, 255, 255),       # Cyan - face rectangle
        "dark_circle": (128, 0, 128),  # Purple - dark circles
        "brown_spot": (139, 90, 43),    # Brown
        "comedone": (255, 255, 0),     # Yellow
        "acne_mark": (255, 0, 0),      # Red
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
    fr = data.get("face_rectangle", {})
    if fr:
        draw_rect(fr, COLORS["face"], "Face", width=4)

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

    # Legend on main image (bottom)
    legend_y = h - 50
    draw.rectangle([0, legend_y, w, h], fill=(30, 30, 30))
    draw.text((15, legend_y + 12), "Cyan: Face | Purple: Dark circles | Brown: Brown spots | Yellow: Comedones | Red: Acne marks", fill=(255, 255, 255), font=font_sm)

    # Create composite: annotated image (left) + metrics panel (right)
    panel_w = min(480, w)
    composite_w = w + panel_w
    # Estimate metrics height: ~50 lines * 18px + section headers
    metrics_h = 50 * 18 + 200
    composite_h = max(h, metrics_h)
    composite = Image.new("RGB", (composite_w, composite_h), (25, 25, 25))
    composite.paste(vis_img, (0, 0))

    # Draw metrics panel on the right
    draw_panel = ImageDraw.Draw(composite)
    try:
        font_panel = ImageFont.truetype("arial.ttf", 14)
        font_title = ImageFont.truetype("arial.ttf", 16)
    except Exception:
        font_panel = ImageFont.load_default()
        font_title = font_panel

    def add_section(title, items, y_start):
        draw_panel.text((w + 12, y_start), title, fill=(100, 200, 255), font=font_title)
        y_start += 22
        for k, v in items:
            draw_panel.text((w + 12, y_start), f"  {k}", fill=(200, 200, 200), font=font_panel)
            draw_panel.text((w + panel_w - 60, y_start), str(v), fill=(255, 255, 255), font=font_panel)
            y_start += 18
        return y_start + 8

    y = 15

    # Main metrics
    y = add_section("MAIN METRICS", [
        ("Skin Age", r.get("skin_age", {}).get("value", "-")),
        ("Skin Type", r.get("skin_type", {}).get("skin_type", "-")),
        ("Skin Tone (ITA)", round(r.get("skintone_ita", {}).get("ITA", 0), 2)),
        ("Skin Hue", r.get("skin_hue_ha", {}).get("skin_hue", "-")),
    ], y)

    # Scores
    y = add_section("SCORES (0-100)", [
        ("Total", s.get("total_score", "-")),
        ("Wrinkle", s.get("wrinkle_score", "-")),
        ("Pores", s.get("pores_score", "-")),
        ("Blackhead", s.get("blackhead_score", "-")),
        ("Acne", s.get("acne_score", "-")),
        ("Dark Circle", s.get("dark_circle_score", "-")),
        ("Skin Type", s.get("skin_type_score", "-")),
        ("Water", s.get("water_score", "-")),
        ("Roughness", s.get("rough_score", "-")),
        ("Melanin", s.get("melanin_score", "-")),
        ("Sensitivity", s.get("sensitivity_score", "-")),
        ("Red Spot", s.get("red_spot_score", "-")),
    ], y)

    # Counts
    y = add_section("COUNTS", [
        ("Blackheads", r.get("blackhead_count", "-")),
        ("Brown Spots", r.get("brown_spot", {}).get("count", "-")),
        ("Acne", r.get("acne", {}).get("count", "-")),
        ("Closed Comedones", r.get("closed_comedones", {}).get("count", "-")),
        ("Acne Marks", r.get("acne_mark", {}).get("count", "-")),
        ("Moles", r.get("mole", {}).get("count", "-")),
    ], y)

    # Wrinkle counts
    wc = r.get("wrinkle_count", {})
    wrinkle_items = [(k.replace("_", " ").title(), v) for k, v in wc.items()]
    y = add_section("WRINKLE COUNTS", wrinkle_items, y)

    # Enlarged pores
    epc = r.get("enlarged_pore_count", {})
    pore_items = [(k.replace("_", " ").title(), v) for k, v in epc.items()]
    y = add_section("ENLARGED PORES", pore_items, y)

    # Severity levels
    sev_keys = ["dark_circle_severity", "eye_pouch_severity", "forehead_wrinkle_severity",
                "left_crows_feet_severity", "right_crows_feet_severity", "left_eye_finelines_severity",
                "right_eye_finelines_severity", "glabella_wrinkle_severity", "left_nasolabial_fold_severity",
                "right_nasolabial_fold_severity"]
    sev_items = []
    for key in sev_keys:
        val = r.get(key, {})
        v = val.get("value", val.get("confidence", "-")) if isinstance(val, dict) else val
        sev_items.append((key.replace("_", " ").title(), v))
    y = add_section("SEVERITY (0-3)", sev_items, y)

    # Save output
    out_path = image_path.replace(".png", "_analysis.png")
    composite.save(out_path)
    print(f"\nVisualization saved to: {out_path}\n")
