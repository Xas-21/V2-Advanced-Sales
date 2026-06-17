import bcrypt as _bcrypt
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from utils import USERS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api")

_login_attempts: dict[str, list[datetime]] = defaultdict(list)


class LoginRequest(BaseModel):
    username: str
    password: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


def _hash_password(pwd: str) -> str:
    return _bcrypt.hashpw(pwd.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _is_bcrypt_hash(s: str) -> bool:
    return s.startswith("$2b$") or s.startswith("$2a$") or s.startswith("$2y$")


def _check_password(pwd: str, stored: str) -> bool:
    if not pwd or not stored:
        return False
    if _is_bcrypt_hash(stored):
        try:
            return _bcrypt.checkpw(pwd.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    return stored == pwd


def _needs_rehash(stored: str) -> bool:
    return bool(stored) and not _is_bcrypt_hash(stored)


def _check_login_rate_limit(ip: str):
    now = datetime.utcnow()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if t > now - timedelta(minutes=1)]
    if len(_login_attempts[ip]) >= 5:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 1 minute.")


def _record_login_attempt(ip: str):
    _login_attempts[ip].append(datetime.utcnow())


def _next_session_version(user: dict) -> int:
    return int(user.get("sessionVersion") or 0) + 1


@router.post("/auth/change-password")
def change_password(request: ChangePasswordRequest):
    if not request.new_password or len(request.new_password) < 4:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 4 characters",
        )

    users = read_json_file(USERS_FILE)
    idx = next(
        (
            i
            for i, u in enumerate(users)
            if str(u.get("username", "")).lower() == request.username.strip().lower()
        ),
        -1,
    )
    if idx < 0:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user = users[idx]
    stored = str(user.get("password", ""))
    if not _check_password(request.current_password, stored):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if _check_password(request.new_password, stored):
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the current password",
        )

    new_ver = _next_session_version(user)
    users[idx] = {**user, "password": _hash_password(request.new_password), "sessionVersion": new_ver}
    write_json_file(USERS_FILE, users)
    return {"ok": True, "sessionVersion": new_ver}


@router.post("/login")
def login(request: LoginRequest, http_req: Request):
    ip_addr = http_req.client.host if http_req.client else "127.0.0.1"
    _check_login_rate_limit(ip_addr)

    if request.password is None or request.password == "":
        _record_login_attempt(ip_addr)
        raise HTTPException(
            status_code=400,
            detail="password field is required",
        )

    users = read_json_file(USERS_FILE)

    user = next(
        (u for u in users if u["username"].lower() == request.username.lower()),
        None,
    )

    if not user:
        _record_login_attempt(ip_addr)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored = user["password"]
    if not _check_password(request.password, stored):
        _record_login_attempt(ip_addr)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if _needs_rehash(stored):
        user["password"] = _hash_password(request.password)
        write_json_file(USERS_FILE, users)

    result = {k: v for k, v in user.items() if k != "password"}
    if "sessionVersion" not in result:
        result["sessionVersion"] = int(user.get("sessionVersion") or 0)
    body = {"user": result}
    resp = JSONResponse(content=body)
    resp.set_cookie(
        key="session_id",
        value=str(user.get("id", user["username"])),
        max_age=86400,
        httponly=True,
        samesite="lax",
    )
    return resp
