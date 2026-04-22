import uuid

from fastapi import APIRouter
from utils import USERS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api/users")


def _next_session_version(user: dict) -> int:
    return int(user.get("sessionVersion") or 0) + 1


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


@router.post("")
def create_or_update_user(user_data: dict):
    users = read_json_file(USERS_FILE)

    raw_id = user_data.get("id")
    has_stable_id = raw_id is not None and str(raw_id).strip() != ""

    existing_idx = -1
    if has_stable_id:
        rid = str(raw_id)
        for i, u in enumerate(users):
            if str(u.get("id", "")) == rid:
                existing_idx = i
                break

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
        new_pw_raw = payload.pop("password", None)
        merged = {**prev, **payload}
        if new_pw_raw is not None and str(new_pw_raw).strip() != "":
            new_pw = str(new_pw_raw)
            old_pw = str(prev.get("password", "password123"))
            merged["password"] = new_pw
            if new_pw != old_pw:
                merged["sessionVersion"] = _next_session_version(prev)
        else:
            merged["password"] = prev.get("password", "password123")

        users[existing_idx] = merged
    else:
        row = dict(user_data)
        pw = row.get("password")
        if pw is None or str(pw).strip() == "":
            row["password"] = "password123"
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
