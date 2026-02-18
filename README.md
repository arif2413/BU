# Skin Analysis Mobile App

Camera-based skin analysis app: take a photo on your phone, send to backend for analysis, view annotated results and metrics.

## Project Structure

```
BU/
├── backend/          # Python FastAPI server
├── mobile/            # React Native app (iOS + Android)
└── skin_analysis.py   # Standalone script (unchanged)
```

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
# Copy .env.example to .env and add AILABAPI_API_KEY
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Mobile App

**For Android emulator** (default config uses `10.0.2.2:8000`):
```bash
cd mobile
npm install
npx react-native run-android
```

**For physical device** on same WiFi:
1. Get your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Edit `mobile/src/config.ts`: set `API_BASE_URL` to `http://YOUR_IP:8000`
3. Run: `npx react-native run-android` or `run-ios`

### 3. Flow

1. Take photo (camera)
2. Tap "Analyze" to send to backend
3. View annotated image + metrics on device
