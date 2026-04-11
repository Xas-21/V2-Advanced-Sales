import json
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from utils import (
    ACCOUNTS_FILE,
    CRM_STATE_FILE,
    FINANCIALS_FILE,
    PROPERTIES_FILE,
    REQUESTS_FILE,
    ROOM_TYPES_FILE,
    TAXES_FILE,
    USERS_FILE,
    VENUES_FILE,
    get_database_url,
    write_json_file,
)


def _read_json(path: str):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _dataset_paths():
    return [
        USERS_FILE,
        PROPERTIES_FILE,
        ROOM_TYPES_FILE,
        VENUES_FILE,
        TAXES_FILE,
        FINANCIALS_FILE,
        REQUESTS_FILE,
        CRM_STATE_FILE,
        ACCOUNTS_FILE,
    ]


def main():
    db_url = get_database_url()
    if not db_url:
        raise RuntimeError("DATABASE_URL is required to import into PostgreSQL.")

    print("Importing JSON datasets into PostgreSQL...")
    imported = 0
    for file_path in _dataset_paths():
        payload = _read_json(file_path)
        write_json_file(file_path, payload)
        print(f"- Imported {Path(file_path).name}")
        imported += 1

    print(f"Done. Imported {imported} datasets.")


if __name__ == "__main__":
    main()
