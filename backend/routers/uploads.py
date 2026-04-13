import hashlib
import os
import time
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])


class CloudinarySignRequest(BaseModel):
    folder: str | None = None


def _first_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _cloudinary_from_url() -> tuple[str, str, str]:
    raw = os.getenv("CLOUDINARY_URL", "").strip()
    if not raw:
        return "", "", ""
    try:
        parsed = urlparse(raw)
        cloud_name = (parsed.hostname or "").strip()
        api_key = (parsed.username or "").strip()
        api_secret = (parsed.password or "").strip()
        return cloud_name, api_key, api_secret
    except Exception:
        return "", "", ""


def _resolve_cloudinary_config() -> tuple[str, str, str]:
    url_cloud, url_key, url_secret = _cloudinary_from_url()
    cloud_name = _first_env("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_CLOUD", "CLOUD_NAME", "CLOUDINARY_NAME") or url_cloud
    api_key = _first_env("CLOUDINARY_API_KEY", "CLOUDINARY_KEY", "API_KEY") or url_key
    api_secret = _first_env("CLOUDINARY_API_SECRET", "CLOUDINARY_SECRET", "API_SECRET") or url_secret
    return cloud_name, api_key, api_secret


@router.post("/cloudinary/sign")
def sign_cloudinary_upload(body: CloudinarySignRequest):
    cloud_name, api_key, api_secret = _resolve_cloudinary_config()

    if not cloud_name or not api_key or not api_secret:
        raise HTTPException(
            status_code=503,
            detail="Cloudinary is not configured on the backend. Set CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET or CLOUDINARY_URL.",
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
