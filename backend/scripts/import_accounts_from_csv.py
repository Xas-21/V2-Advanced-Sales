"""
Import company accounts from a CSV export into Postgres via POST /api/accounts.

Usage (backend running, DATABASE_URL set):
  python import_accounts_from_csv.py --csv "../../accounts_export (1).csv"

Resolves:
  - User: username Abdullah (password not required for API)
  - Property: first property whose name contains "Shaden" (case-insensitive)

Each row sets createdByUserId / ownerUserId so the profile dashboard counts these accounts.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000"


def strip_bom(s: str) -> str:
    if not s:
        return ""
    return str(s).replace("\ufeff", "").strip()


def split_contact_name(raw: str) -> Tuple[str, str]:
    s = strip_bom(raw)
    if not s:
        return "", ""
    # Prefer first "person" if multiple separated by " - " or " | "
    primary = re.split(r"\s*[-–|]\s*", s, maxsplit=1)[0].strip()
    parts = primary.split()
    if len(parts) == 0:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def normalize_phone(raw: Any) -> str:
    if raw is None or raw == "":
        return ""
    s = strip_bom(str(raw)).strip().strip("'\"")
    if not s:
        return ""
    # Excel scientific notation e.g. 9.66537E+11
    if re.match(r"^[\d.]+\s*[eE][+-]?\d+$", s):
        try:
            n = int(float(s))
            return f"+{n}" if n > 0 else s
        except (ValueError, OverflowError):
            return s
    return s


def extract_website(addr: str, website_col: str) -> Tuple[str, str]:
    """Returns (website, address_without_url)."""
    w = strip_bom(website_col)
    a = strip_bom(addr)
    url_re = re.compile(r"(https?://[^\s,]+|www\.[^\s,]+)", re.I)
    found: List[str] = []
    for m in url_re.finditer(a):
        found.append(m.group(0))
    if w:
        found.insert(0, w)
    website = ""
    if found:
        website = found[0]
        if not website.lower().startswith("http"):
            website = "https://" + website.lstrip("/")
    for u in found:
        a = a.replace(u, " ")
    a = re.sub(r"\s+", " ", a).strip(" ,")
    return website, a


def infer_country_and_city(address_block: str) -> Tuple[str, str, str]:
    """
    Returns (street, city, country).
    """
    s = strip_bom(address_block)
    if not s:
        return "", "", "Saudi Arabia"

    low = s.lower()
    country = "Saudi Arabia"
    if "lithuania" in low or re.search(r"\blt-\d", low):
        country = "Lithuania"
    elif "milano" in low or "italy" in low or re.search(r"\bit\b", low):
        country = "Italy"
    elif "china" in low or ".cn" in low or re.search(r"\+86", s):
        country = "China"
    elif "jordan" in low or "amman" in low:
        country = "Jordan"
    elif "uae" in low or "dubai" in low or "emirates" in low or re.search(r"\+971", s):
        country = "United Arab Emirates"
    elif "usa" in low or "state.gov" in low:
        country = "United States"
    elif "azerbaijan" in low or re.search(r"\+994", s):
        country = "Azerbaijan"
    elif "ksa" in low and country == "Saudi Arabia":
        country = "Saudi Arabia"

    # Single-token city (e.g. "Riyadh", "a")
    lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
    flat = " ".join(lines)

    city = ""
    street = flat

    # Known Saudi / local place tokens
    city_patterns = [
        (r"\bAlUla\b", "AlUla"),
        (r"\bAl Ula\b", "AlUla"),
        (r"\bRiyadh\b", "Riyadh"),
        (r"\bJeddah\b", "Jeddah"),
        (r"\bKaunas\b", "Kaunas"),
        (r"\bMilano\b", "Milan"),
        (r"\bMakkah\b", "Makkah"),
        (r"\bMedina\b", "Medina"),
        (r"\bDammam\b", "Dammam"),
        (r"\bKhobar\b", "Khobar"),
    ]
    for pat, cname in city_patterns:
        if re.search(pat, s, re.I):
            # "Makkah Road" is a street name in Riyadh, not the city Makkah
            if cname == "Makkah" and re.search(r"makkah\s+road", low):
                continue
            city = cname
            break

    if re.search(r"olaya", low) and re.search(r"makkah\s+road", low):
        city = "Riyadh"
        street = flat

    # "Company, City, KSA"
    if "," in flat and not city:
        parts = [p.strip() for p in flat.split(",") if p.strip()]
        if len(parts) >= 2:
            last = parts[-1].lower()
            last_is_streetish = bool(
                re.search(r"\d|road|route|highway|floor|office|district|olaya|makkah|building", last, re.I)
            )
            if last_is_streetish:
                # e.g. "Olaya ,Makkah Road 11383" → full line is street / district
                street = flat
            elif last in ("ksa", "saudi arabia", "saudi"):
                country = "Saudi Arabia"
                city = parts[-2] if len(parts) >= 2 else ""
                street = ", ".join(parts[:-2]) if len(parts) > 2 else parts[0]
            else:
                city = parts[-1]
                street = ", ".join(parts[:-1])

    if len(flat) <= 2 and flat.isalpha():
        # garbage single letter
        street = ""

    if not city and len(lines) == 1 and len(lines[0]) < 40 and "@" not in lines[0]:
        # single short line → treat as city (e.g. "Riyadh")
        if not re.search(r"\d{4,}", lines[0]):
            city = lines[0]
            street = ""

    # "AlUla Al Azizyah" → city + district
    if re.search(r"alula", flat, re.I) and re.search(r"azizyah", flat, re.I):
        city = "AlUla"
        street = flat

    return street, city, country


def row_looks_like_emails_only(s: str) -> bool:
    s = strip_bom(s)
    if not s:
        return False
    return bool(re.search(r"@", s)) and not re.search(r"\d{4,}|street|road|plaza|building|floor", s, re.I)


def load_rows(csv_path: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row = {strip_bom(k): strip_bom(v) if isinstance(v, str) else v for k, v in raw.items()}
            name = row.get("Name") or row.get("name") or ""
            if not strip_bom(name):
                continue
            rows.append(row)
    return rows


def build_account_payload(
    row: Dict[str, str],
    property_id: str,
    owner: Dict[str, Any],
    seq: int,
) -> Dict[str, Any]:
    name = strip_bom(row.get("Name", ""))
    acc_type = strip_bom(row.get("Account Type", "")) or "Corporate"
    contact_raw = row.get("Contact Person", "") or ""
    position = strip_bom(row.get("Position", ""))
    phone = normalize_phone(row.get("Phone", ""))
    email = strip_bom(row.get("Email", ""))
    address_raw = row.get("Address", "") or ""
    website_col = row.get("Website", "") or ""

    website, addr_clean = extract_website(address_raw, website_col)
    notes_parts: List[str] = []
    if row_looks_like_emails_only(addr_clean):
        notes_parts.append(f"Additional contacts / notes from export: {addr_clean}")
        addr_clean = ""

    street, city, country = infer_country_and_city(addr_clean)
    if row_looks_like_emails_only(street):
        notes_parts.append(street)
        street = ""

    first, last = split_contact_name(contact_raw)

    contact = {
        "firstName": first,
        "lastName": last,
        "position": position,
        "email": email,
        "phone": phone,
        "city": city or "",
        "country": country,
    }

    aid = f"CSV_ABD_{seq:03d}_{uuid.uuid4().hex[:6]}"

    payload: Dict[str, Any] = {
        "id": aid,
        "name": name,
        "type": acc_type,
        "city": city,
        "country": country,
        "street": street,
        "website": website,
        "propertyId": property_id,
        "createdByUserId": owner["id"],
        "createdByUsername": owner.get("username"),
        "ownerUserId": owner["id"],
        "ownerUsername": owner.get("username"),
        "contacts": [contact],
        "activities": [],
    }
    if notes_parts:
        payload["notes"] = "\n".join(notes_parts)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "accounts_export (1).csv",
        help="Path to accounts_export CSV",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("API_BASE_URL", DEFAULT_BASE),
        help="API base URL (or set API_BASE_URL env)",
    )
    args = parser.parse_args()
    csv_path: Path = args.csv
    base = str(args.base_url).rstrip("/")

    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    rows = load_rows(csv_path)
    if not rows:
        print("No data rows in CSV.", file=sys.stderr)
        return 1

    with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
        try:
            r = client.get(f"{base}/api/health")
            r.raise_for_status()
            health = r.json()
            if health.get("storage") != "postgres":
                print(
                    "Backend storage is not postgres; accounts API needs DATABASE_URL.",
                    file=sys.stderr,
                )
                return 1
        except httpx.HTTPError as e:
            print(f"Cannot reach API at {base}: {e}", file=sys.stderr)
            return 1

        users = client.get(f"{base}/api/users").json()
        props = client.get(f"{base}/api/properties").json()
        abd = next(
            (u for u in users if str(u.get("username", "")).lower() == "abdullah"),
            None,
        )
        shaden = next(
            (p for p in props if "shaden" in str(p.get("name", "")).lower()),
            None,
        )
        if not abd:
            print("User 'Abdullah' not found in /api/users.", file=sys.stderr)
            return 1
        if not shaden:
            print("No property with 'Shaden' in name found.", file=sys.stderr)
            return 1

        pid = str(shaden["id"])
        print(f"Property: {shaden.get('name')} ({pid})")
        print(f"Owner: {abd.get('name')} ({abd.get('username')}) id={abd.get('id')}")
        print(f"Importing {len(rows)} accounts from {csv_path.name}...")

        ok = 0
        for i, row in enumerate(rows, start=1):
            payload = build_account_payload(row, pid, abd, i)
            try:
                pr = client.post(f"{base}/api/accounts", json=payload)
                pr.raise_for_status()
                ok += 1
            except httpx.HTTPError as e:
                print(f"FAIL row {i} {payload.get('name')}: {e}", file=sys.stderr)
        print(f"Done. Created/updated {ok}/{len(rows)} accounts.")
    return 0 if ok == len(rows) else 2


if __name__ == "__main__":
    raise SystemExit(main())
