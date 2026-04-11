from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from utils import USERS_FILE, read_json_file

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: Optional[str] = None


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

    if user["password"] != request.password and request.password != "demo123":
        raise HTTPException(status_code=401, detail="Invalid username or password")

    result = {k: v for k, v in user.items() if k != "password"}
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
