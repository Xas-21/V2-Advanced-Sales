from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from utils import USERS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


def _password_accepted(stored: str, provided: str) -> bool:
    """Match login rules: correct stored password, or shared demo override."""
    if provided == "demo123":
        return True
    return stored == provided


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
    if not _password_accepted(stored, request.current_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if request.new_password == stored:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the current password",
        )

    new_ver = _next_session_version(user)
    users[idx] = {**user, "password": request.new_password, "sessionVersion": new_ver}
    write_json_file(USERS_FILE, users)
    return {"ok": True, "sessionVersion": new_ver}


@router.post("/login")
def login(request: LoginRequest):
    if request.password is None or request.password == "":
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
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not _password_accepted(user["password"], request.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

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
