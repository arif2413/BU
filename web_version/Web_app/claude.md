# Skin Analysis Web Frontend - Plan Reference

## Current State

- **Backend** (backend/main.py, backend/analyzer.py): A working FastAPI server that accepts image uploads, calls the AILabTools Skin Analysis Pro API, annotates the image with Pillow, and returns metrics + region coordinates for interactive SVG highlighting. The frontend is currently embedded as a raw HTML string inside `main.py`.
- **Web_app/**: Empty directory (the workspace root). This is where the new frontend will live.
- **API Key**: `IUnRk1bTqCDsDhn6IWuke1OeKwu6dY9ghzAMBdp53PyWZlsAUGm2cPBYxaR8j7Nt` -- stored in `backend/.env`.
- **API Endpoint**: `https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro` (POST, multipart/form-data)
- **API Auth Header**: `ailabapi-api-key`

## Architecture

```
Browser (Web_app/) --POST /analyze (image)--> FastAPI Backend --multipart/form-data--> AILabTools API
AILabTools API --JSON + regions--> FastAPI Backend --annotated image + metrics + region coords--> Browser
```

## Tasks

### 1. Create frontend files in `Web_app/`

- **`Web_app/index.html`** -- Main page with:
  - Upload zone (drag-and-drop + file picker)
  - Camera capture button using `navigator.mediaDevices.getUserMedia()` with a live video preview and "Take Photo" button (captures to canvas, converts to blob)
  - Image preview area
  - "Analyze" button
  - Results section: the **original uploaded image** with an SVG overlay for highlighted regions, plus a metrics panel with clickable items

- **`Web_app/styles.css`** -- Modern dark theme styling:
  - Responsive layout
  - Upload zone, camera modal/section, results flex layout
  - SVG overlay for region highlighting with color-coded categories
  - Metric rows with hover states and expandable explanations

- **`Web_app/app.js`** -- All frontend logic:
  - File selection (drag-drop + click)
  - Camera: `getUserMedia({video: {facingMode: "user"}})` -> live `<video>` preview -> "Capture" draws to a hidden `<canvas>` -> `canvas.toBlob()` for upload
  - POST to `/analyze` as `multipart/form-data`
  - Parse response: render the annotated image, set up SVG `viewBox` from `image_width`/`image_height`, draw rectangles from `regions` data when metrics are clicked
  - Flatten nested metrics JSON into a clickable list with explanations
  - Region highlighting: map metric keys to region keys (`acne`, `dark_circle`, `brown_spot`, `blackhead`, `face`, `acne_mark`), draw colored SVG `<rect>` elements

### 2. Update backend to serve the frontend

Modify `backend/main.py`:
- Remove the embedded `UPLOAD_HTML` string (~330 lines of HTML/CSS/JS)
- Mount `Web_app/` as static files using `app.mount("/", StaticFiles(directory=..., html=True))` so `index.html` is served at `/`
- Keep the `POST /analyze` endpoint unchanged (it already works correctly)
- The `POST /analyze` route must be registered **before** the static files mount to take priority

### 3. Set the API key in `backend/.env`

Write `AILABAPI_API_KEY=IUnRk1bTqCDsDhn6IWuke1OeKwu6dY9ghzAMBdp53PyWZlsAUGm2cPBYxaR8j7Nt` to `backend/.env`. The existing `analyzer.py` already reads this via `os.environ.get("AILABAPI_API_KEY")`.

## Key Implementation Details

### Camera capture flow
1. User clicks "Use Camera" -> request `getUserMedia` permission
2. Show live `<video>` stream with a "Take Photo" button
3. On capture: draw video frame to hidden `<canvas>`, call `canvas.toBlob("image/jpeg", 0.92)`
4. Use the resulting blob as `selectedFile` (same as file upload path)
5. Show preview and enable "Analyze" button

### Region overlay (reuses existing logic from embedded frontend)
- Backend returns `regions` dict with keys like `face`, `dark_circle`, `brown_spot`, `blackhead`, `acne`, `acne_mark`
- Each maps to an array of `{left, top, width, height}` rectangles
- SVG viewBox matches original image dimensions
- Clicking a metric draws colored semi-transparent rectangles on the overlay
- Color scheme: cyan=face, purple=dark circles, brown=spots, yellow=comedones, red=acne

### No new dependencies needed
The backend `requirements.txt` is already complete. The frontend is pure HTML/CSS/JS.

## Existing Files Reference

- `backend/main.py` -- FastAPI server (lines 1-403), embedded HTML at lines 28-361, `/analyze` endpoint at lines 369-402
- `backend/analyzer.py` -- API integration + image annotation (lines 1-270), `run_analysis()` at line 235, `analyze_skin()` at line 31, `create_annotated_image()` at line 43
- `backend/requirements.txt` -- fastapi, uvicorn, python-multipart, requests, Pillow, python-dotenv
- `backend/.env.example` -- Template for env vars
- `backend/.env` -- Actual env vars (API key)

## API Response Structure (AILabTools Skin Analysis Pro)

- `face_rectangle`: `{top, left, width, height}` -- face bounding box
- `result`: Main analysis object containing:
  - `dark_circle_mark`: `{left_eye_rect, right_eye_rect}` -- dark circle regions
  - `brown_spot`: `{rectangle: [...], polygon: [...], confidence: [...], count}`
  - `closed_comedones`: `{rectangle: [...], polygon: [...], confidence: [...], count}`
  - `acne`: `{rectangle: [...], polygon: [...], confidence: [...], count}`
  - `acne_mark`: `{rectangle: [...], polygon: [...], confidence: [...], count}`
  - `mole`: `{rectangle: [...], polygon: [...], confidence: [...], count}`
  - `skin_type`, `skin_age`, `score_info`, wrinkle data, pore data, sensitivity data, etc.
- `error_code`: 0 = success
- `error_msg`: Error description if any
