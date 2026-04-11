import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
PROPERTIES_FILE = os.path.join(DATA_DIR, "properties.json")
ROOM_TYPES_FILE = os.path.join(DATA_DIR, "room_types.json")
VENUES_FILE = os.path.join(DATA_DIR, "venues.json")
TAXES_FILE = os.path.join(DATA_DIR, "taxes.json")
FINANCIALS_FILE = os.path.join(DATA_DIR, "financials.json")
REQUESTS_FILE = os.path.join(DATA_DIR, "requests.json")
CRM_STATE_FILE = os.path.join(DATA_DIR, "crm_state.json")

def read_json_file(file_path, default=None):
    if not os.path.exists(file_path):
        return default if default is not None else []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []

def write_json_file(file_path, data):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
