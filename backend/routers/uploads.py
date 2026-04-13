import hashlib
import os
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])


class CloudinarySignRequest(BaseModel):
    folder: str | None = None


@router.post("/cloudinary/sign")
def sign_cloudinary_upload(body: CloudinarySignRequest):
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()

    if not cloud_name or not api_key or not api_secret:
        raise HTTPException(
            status_code=503,
            detail="Cloudinary is not configured on the backend.",
        )

    timestamp = int(time.time())
    params = {"timestamp": str(timestamp)}
    folder = (body.folder or "").strip()
    if folder:
        params["folder"] = folder

    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
    signature = hashlib.sha1(f"{to_sign}{api_secret}".encode("utf-8")).hexdigest()

    return {
        "cloudName": cloud_name,
        "apiKey": api_key,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder or None,
    }
