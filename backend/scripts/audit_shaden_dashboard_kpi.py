"""Export Shaden requests for dashboard KPI audit."""
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import list_requests_rows  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "scripts" / "_shaden_requests_audit.json"
SHADEN = "Ps8b83kgbm"

if __name__ == "__main__":
    rows = list_requests_rows(SHADEN)
    OUT.write_text(json.dumps(rows), encoding="utf-8")
    print(f"Wrote {len(rows)} requests to {OUT}")
