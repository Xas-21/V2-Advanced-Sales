import hashlib
import os
import time
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])


class CloudinarySignRequest(BaseModel):
    folder: str | None = None


class CloudinaryDeleteRequest(BaseModel):
    publicId: str
    resourceType: str | None = "raw"
    deliveryType: str | None = "upload"
    invalidate: bool | None = True


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


def _cloudinary_signature(params: dict[str, str], api_secret: str) -> str:
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
    return hashlib.sha1(f"{to_sign}{api_secret}".encode("utf-8")).hexdigest()


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

    signature = _cloudinary_signature(params, api_secret)

    return {
        "cloudName": cloud_name,
        "apiKey": api_key,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder or None,
    }


@router.post("/cloudinary/delete")
def delete_cloudinary_asset(body: CloudinaryDeleteRequest):
    cloud_name, api_key, api_secret = _resolve_cloudinary_config()
    if not cloud_name or not api_key or not api_secret:
        raise HTTPException(
            status_code=503,
            detail="Cloudinary is not configured on the backend. Set CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET or CLOUDINARY_URL.",
        )

    public_id = str(body.publicId or "").strip()
    if not public_id:
        raise HTTPException(status_code=400, detail="publicId is required.")

    resource_type = str(body.resourceType or "raw").strip().lower()
    delivery_type = str(body.deliveryType or "upload").strip().lower()
    invalidate = bool(body.invalidate if body.invalidate is not None else True)
    timestamp = int(time.time())

    sign_params = {
        "public_id": public_id,
        "timestamp": str(timestamp),
        "type": delivery_type,
    }
    if invalidate:
        sign_params["invalidate"] = "true"
    signature = _cloudinary_signature(sign_params, api_secret)

    url = f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/destroy"
    form = {
        "public_id": public_id,
        "timestamp": str(timestamp),
        "api_key": api_key,
        "signature": signature,
        "type": delivery_type,
    }
    if invalidate:
        form["invalidate"] = "true"

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(url, data=form)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        payload = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete Cloudinary asset: {exc}") from exc

    return {
        "result": payload.get("result"),
        "publicId": public_id,
        "resourceType": resource_type,
    }
