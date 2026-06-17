"""CORS middleware with Render-friendly origin fallbacks."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from starlette.middleware.cors import CORSMiddleware


def _normalize_origin(origin: str) -> str:
    """Browser Origin headers never include a path or trailing slash."""
    origin = (origin or "").strip()
    if not origin:
        return origin
    parsed = urlparse(origin.rstrip("/"))
    if not parsed.scheme or not parsed.hostname:
        return origin.rstrip("/")
    host = parsed.hostname.lower()
    scheme = parsed.scheme.lower()
    if parsed.port and parsed.port not in (80, 443):
        netloc = f"{host}:{parsed.port}"
    else:
        netloc = host
    return f"{scheme}://{netloc}"


def _render_host(host: str) -> bool:
    host = host.lower().rstrip(".")
    return host == "onrender.com" or host.endswith(".onrender.com")


def _expand_www_variants(origins: list[str]) -> list[str]:
    """Allow both apex and www for custom domains (not Render hosts)."""
    out = list(origins)
    for origin in origins:
        parsed = urlparse(origin)
        host = (parsed.hostname or "").lower()
        if not host or _render_host(host):
            continue
        if host.startswith("www."):
            alt = _normalize_origin(f"{parsed.scheme}://{host[4:]}")
        else:
            alt = _normalize_origin(f"{parsed.scheme}://www.{host}")
        if alt and alt not in out:
            out.append(alt)
    return out


class ProductionCORSMiddleware(CORSMiddleware):
    """Accept configured origins/regex plus any https://*.onrender.com host."""

    def is_allowed_origin(self, origin: str) -> bool:
        origin = _normalize_origin(origin)
        if super().is_allowed_origin(origin):
            return True
        parsed = urlparse(origin)
        if parsed.scheme != "https":
            return False
        host = parsed.hostname
        return bool(host and _render_host(host))


def build_cors_settings() -> tuple[list[str], str | None]:
    import os

    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    origins: list[str] = []
    for part in raw.split(","):
        normalized = _normalize_origin(part.strip())
        if normalized and "*" not in normalized and normalized not in origins:
            origins.append(normalized)

    for key in ("FRONTEND_URL",):
        url = _normalize_origin(os.getenv(key, "").strip())
        if url and url not in origins:
            origins.append(url)

    origins = _expand_www_variants(origins)

    regex = os.getenv(
        "CORS_ORIGIN_REGEX",
        r"^https://([a-z0-9-]+\.)*onrender\.com$",
    ).strip()
    if regex:
        re.compile(regex)
    else:
        regex = None

    return origins, regex
