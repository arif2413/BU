# Skin Analysis Web App

Web-based skin analysis app: upload a face image, send to backend for analysis, view annotated results and metrics in your browser.

## Project Structure

```
BU/
├── backend/          # Python FastAPI server (API + web UI)
└── skin_analysis.py  # Standalone script (unchanged)
```

## Quick Start

### 1. Backend & Web UI

```bash
cd backend
pip install -r requirements.txt
# Copy .env.example to .env and add AILABAPI_API_KEY
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Open in Browser

Go to **http://localhost:8000**

### 3. Flow

1. Upload an image (Choose Image or drag-and-drop)
2. Click "Analyze" to send to backend
3. View annotated image + metrics in the browser
