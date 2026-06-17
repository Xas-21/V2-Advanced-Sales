"""CORS middleware with Render-friendly origin fallbacks."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from starlette.middleware.cors import CORSMiddleware


def _render_host(host: str) -> bool:
    host = host.lower().rstrip(".")
    return host == "onrender.com" or host.endswith(".onrender.com")


class ProductionCORSMiddleware(CORSMiddleware):
    """Accept configured origins/regex plus any https://*.onrender.com host."""

    def is_allowed_origin(self, origin: str) -> bool:
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
    origins = [o.strip() for o in raw.split(",") if o.strip() and "*" not in o.strip()]

    for key in ("FRONTEND_URL",):
        url = os.getenv(key, "").strip().rstrip("/")
        if url and url not in origins:
            origins.append(url)

    regex = os.getenv(
        "CORS_ORIGIN_REGEX",
        r"^https://([a-z0-9-]+\.)*onrender\.com$",
    ).strip()
    if regex:
        re.compile(regex)
    else:
        regex = None

    return origins, regex
