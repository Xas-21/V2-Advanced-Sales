from typing import Any

from fastapi import Cookie, HTTPException, Request
from utils import USERS_FILE, read_json_file


def get_current_user(session_id: str = Cookie(default=None)) -> dict[str, Any] | None:
    if not session_id:
        return None
    users = read_json_file(USERS_FILE)
    for u in users:
        if str(u.get("id") or "") == session_id:
            return u
    return None


def verify_property_access(property_id: str | None, user: dict[str, Any] | None) -> str | None:
    if not user:
        return property_id
    user_pid = str(user.get("propertyId") or "")
    if not user_pid:
        return property_id
    if property_id and property_id != user_pid:
        raise HTTPException(
            status_code=403,
            detail=f"User does not have access to property {property_id}",
        )
    return property_id
