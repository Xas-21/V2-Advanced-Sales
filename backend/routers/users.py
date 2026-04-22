import uuid

from fastapi import APIRouter, HTTPException
from utils import USERS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api/users")

# Fields allowed on PATCH (property assignment, profile-ish updates) — never includes password.
USER_PATCH_SAFE_KEYS = frozenset(
    {
        "propertyId",
        "status",
        "name",
        "email",
        "username",
        "role",
        "permissionGrants",
        "permissionRevokes",
        "stats",
        "avatar",
    }
)


def _next_session_version(user: dict) -> int:
    return int(user.get("sessionVersion") or 0) + 1


def _user_index_by_id(users: list, user_id: str) -> int:
    rid = str(user_id).strip()
    for i, u in enumerate(users):
        if str(u.get("id", "")) == rid:
            return i
    return -1


@router.get("")
def get_users():
    users = read_json_file(USERS_FILE)
    # Filter passwords for safety; always expose sessionVersion for client auth alignment
    out = []
    for user in users:
        row = {k: v for k, v in user.items() if k != "password"}
        row["sessionVersion"] = int(user.get("sessionVersion") or 0)
        out.append(row)
    return out


@router.patch("/{user_id}")
def patch_user(user_id: str, patch: dict):
    """
    Merge only safe fields from the client. Password and sessionVersion are never taken from the body;
    use POST with password or /api/auth/change-password to change credentials.
    """
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object body")

    users = read_json_file(USERS_FILE)
    idx = _user_index_by_id(users, user_id)
    if idx < 0:
        raise HTTPException(status_code=404, detail="User not found")

    prev = dict(users[idx])
    stored_pw = prev.get("password")
    updates = {k: v for k, v in patch.items() if k in USER_PATCH_SAFE_KEYS}
    merged = {**prev, **updates}
    merged["password"] = stored_pw
    if "sessionVersion" in patch:
        merged.pop("sessionVersion", None)

    users[idx] = merged
    write_json_file(USERS_FILE, users)

    out_user = {k: v for k, v in merged.items() if k != "password"}
    out_user["sessionVersion"] = int(merged.get("sessionVersion") or 0)
    return {"message": "User updated successfully", "user": out_user}


@router.post("")
def create_or_update_user(user_data: dict):
    users = read_json_file(USERS_FILE)

    raw_id = user_data.get("id")
    has_stable_id = raw_id is not None and str(raw_id).strip() != ""

    existing_idx = -1
    if has_stable_id:
        existing_idx = _user_index_by_id(users, str(raw_id))

    if not str(user_data.get("username", "")).strip():
        nm = str(user_data.get("name") or "").strip()
        user_data["username"] = (
            nm.split()[0].lower()
            if nm
            else f"user_{uuid.uuid4().hex[:6]}"
        )

    if existing_idx >= 0:
        prev = users[existing_idx]
        payload = dict(user_data)
        payload.pop("sessionVersion", None)
        new_pw_raw = payload.pop("password", None)
        merged = {**prev, **payload}
        if new_pw_raw is not None and str(new_pw_raw).strip() != "":
            new_pw = str(new_pw_raw)
            old_pw = str(prev.get("password") or "")
            merged["password"] = new_pw
            if new_pw != old_pw:
                merged["sessionVersion"] = _next_session_version(prev)
        else:
            merged["password"] = prev.get("password")

        users[existing_idx] = merged
    else:
        row = dict(user_data)
        row.pop("sessionVersion", None)
        pw = row.get("password")
        if pw is None or str(pw).strip() == "":
            raise HTTPException(
                status_code=400,
                detail="Password is required when creating a new user",
            )
        if len(str(pw).strip()) < 4:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 4 characters",
            )
        if not str(row.get("id", "")).strip():
            row["id"] = f"U-{uuid.uuid4().hex[:10]}"
        users.append(row)

    write_json_file(USERS_FILE, users)
    saved = users[existing_idx] if existing_idx >= 0 else users[-1]
    out_user = {k: v for k, v in saved.items() if k != "password"}
    out_user["sessionVersion"] = int(saved.get("sessionVersion") or 0)

    return {"message": "User saved successfully", "user": out_user}


@router.delete("/{user_id}")
def delete_user(user_id: str):
    users = read_json_file(USERS_FILE)
    users = [u for u in users if str(u.get("id")) != str(user_id)]
    write_json_file(USERS_FILE, users)
    return {"message": "User deleted successfully"}
