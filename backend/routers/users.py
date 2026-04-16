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
    
    # Check if user exists (by ID)
    existing_idx = next((i for i, u in enumerate(users) if u.get("id") == user_data.get("id")), -1)
    
    # Standardize data structure
    if "password" not in user_data:
        user_data["password"] = "password123" # Default password for new users
        
    if "username" not in user_data:
        user_data["username"] = user_data.get("name", "").split(" ")[0].lower()
        
    if existing_idx >= 0:
        prev = users[existing_idx]
        # Preserve existing passwords if untouched
        if "password" not in user_data or user_data["password"] == "":
            user_data["password"] = prev.get("password", "password123")
        else:
            new_pw = user_data["password"]
            old_pw = prev.get("password", "password123")
            if new_pw != old_pw:
                user_data["sessionVersion"] = _next_session_version(prev)
        users[existing_idx] = {**prev, **user_data}
    else:
        if not user_data.get("id"):
            user_data["id"] = f"U-{uuid.uuid4().hex[:10]}"
        users.append(user_data)
        
    write_json_file(USERS_FILE, users)
    return {"message": "User saved successfully", "user": {k: v for k, v in user_data.items() if k != "password"}}

@router.delete("/{user_id}")
def delete_user(user_id: str):
    users = read_json_file(USERS_FILE)
    users = [u for u in users if str(u.get("id")) != str(user_id)]
    write_json_file(USERS_FILE, users)
    return {"message": "User deleted successfully"}
