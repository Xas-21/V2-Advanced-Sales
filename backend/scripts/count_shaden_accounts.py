"""
Print how many accounts the API returns for Shaden Resort (or any property name substring).

Uses GET /api/properties and GET /api/accounts — no database password needed.

  set API_BASE_URL=https://your-render-service.onrender.com
  python count_shaden_accounts.py

  python count_shaden_accounts.py --property "Shaden"
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default=os.getenv("API_BASE_URL", DEFAULT_BASE))
    p.add_argument("--property", default="Shaden", help="Substring to match property name")
    args = p.parse_args()
    base = str(args.base_url).rstrip("/")
    sub = args.property.strip().lower()

    try:
        with httpx.Client(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
            r = client.get(f"{base}/api/properties")
            r.raise_for_status()
            props = r.json()
            if not isinstance(props, list):
                print("Unexpected /api/properties response", file=sys.stderr)
                return 1
            matches = [x for x in props if sub in str(x.get("name", "")).lower()]
            if not matches:
                print(f"No property matching {args.property!r}. Available:")
                for x in props:
                    print(f"  - {x.get('name')} ({x.get('id')})")
                return 1
            for prop in matches:
                pid = str(prop.get("id", ""))
                name = prop.get("name", "")
                ar = client.get(f"{base}/api/accounts", params={"propertyId": pid})
                ar.raise_for_status()
                accs = ar.json()
                n = len(accs) if isinstance(accs, list) else 0
                print(f"{name}  id={pid}  accounts={n}")
    except httpx.HTTPError as e:
        print(f"HTTP error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
