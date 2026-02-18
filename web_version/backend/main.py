"""
FastAPI backend for skin analysis - accepts image upload, returns metrics + annotated image.
Serves the Web_app/ frontend as static files.
"""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "Web_app"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    logger.warning("Frontend directory not found at %s", FRONTEND_DIR)
