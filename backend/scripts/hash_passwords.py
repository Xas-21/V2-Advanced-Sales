import json
import os

import bcrypt as _bcrypt

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")


def _hash_password(pwd: str) -> str:
    return _bcrypt.hashpw(pwd.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def main():
    if not os.path.exists(USERS_FILE):
        print("No users.json found. Nothing to migrate.")
        return

    with open(USERS_FILE, "r", encoding="utf-8") as f:
        users = json.load(f)

    if not isinstance(users, list):
        print("users.json is not a list. Skipping.")
        return

    modified = 0
    for user in users:
        if not isinstance(user, dict):
            continue
        pwd = user.get("password", "")
        if not pwd or pwd.startswith("$2b$"):
            continue
        user["password"] = _hash_password(pwd)
        modified += 1
        print(f"  Hashed password for: {user.get('username', 'unknown')}")

    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)

    print(f"\nDone. {modified} passwords hashed.")


if __name__ == "__main__":
    main()
