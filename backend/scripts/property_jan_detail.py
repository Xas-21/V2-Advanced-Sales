"""Dump property keys + all Jan-year bucket requests. DATABASE_URL required."""
import json
import os
import re
import sys
from datetime import datetime

import psycopg
from psycopg.rows import dict_row


def parse_ymd(v):
    raw = str(v or "").strip()[:10]
    return raw if re.match(r"^\d{4}-\d{2}-\d{2}$", raw) else ""


def request_primary(r):
    d = (
        r.get("receivedDate")
        or r.get("requestDate")
        or r.get("checkIn")
        or (str(r.get("createdAt") or "")[:10] if r.get("createdAt") else "")
    )
    return str(d or "")[:10]


def bucket_ymd(r):
    if parse_ymd(r.get("checkIn")):
        return parse_ymd(r.get("checkIn"))
    ag = r.get("agenda") or []
    if isinstance(ag, list):
        first = ""
        for row in ag:
            if not isinstance(row, dict):
                continue
            s = parse_ymd(row.get("startDate"))
            if s and (not first or s < first):
                first = s
        if first:
            return first
    return request_primary(r)


def is_excl(r):
    s = str(r.get("status") or "").strip().lower()
    return s in ("cancelled", "lost")


def _norm_url(u: str) -> str:
    if "sslmode=" in u or "render.com" not in u:
        return u
    return u + ("&" if "?" in u else "?") + "sslmode=require"


def main():
    if len(sys.argv) < 3:
        print("Usage: property_jan_detail.py <propertyId> <YYYY>  (e.g. Ps8b83kgbm 2026)")
        return 1
    pid, year_s = sys.argv[1], sys.argv[2]
    y_target = int(year_s)
    url = _norm_url(os.getenv("DATABASE_URL", "").strip())
    if not url:
        print("DATABASE_URL required")
        return 1
    conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=60)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload FROM app_collection_rows
                WHERE collection_name = 'properties' AND row_id = %s
                """,
                (pid,),
            )
            r = cur.fetchone()
            p = r["payload"] if r and isinstance(r["payload"], dict) else json.loads((r or {}).get("payload") or "{}")
            print("--- PROPERTY (top-level keys) ---", sorted(p.keys()) if p else [])
            for k in [
                "id",
                "name",
                "address",
                "phone",
                "email",
                "currency",
                "timeZone",
                "accountTypes",
                "segments",
            ]:
                if k in p:
                    v = p.get(k)
                    if k in ("accountTypes", "segments") and isinstance(v, list):
                        print(f"{k}: {v}")
                    else:
                        print(f"{k}: {v}")
            cur.execute("SELECT id, payload FROM requests_rows WHERE property_id = %s", (pid,))
            rows = cur.fetchall()
        jan = []
        for row in rows:
            pl = row["payload"]
            if not isinstance(pl, dict):
                pl = json.loads(pl or "{}")
            if is_excl(pl):
                continue
            ymd = bucket_ymd(pl)
            if len(ymd) < 10:
                continue
            y = int(ymd[:4])
            m = int(ymd[5:7])
            if y != y_target or m != 1:
                continue
            jan.append((str(row["id"]), pl, ymd))
        jan.sort(key=lambda x: x[2])
        print()
        print(f"=== {year_s} January bucket: {len(jan)} non-cancelled requests ===")
        for rid, pl, ymd in jan:
            print(
                rid,
                "|",
                ymd,
                "|",
                pl.get("status"),
                "|",
                pl.get("requestType"),
                "|",
                (pl.get("requestName") or "")[:60],
            )
            print(
                "   accountName:",
                pl.get("accountName"),
                "| accountId:",
                pl.get("accountId"),
                "| accountType (on request):",
                repr(pl.get("accountType") or ""),
            )
        with conn.cursor() as cur:
            cur.execute("SELECT id, payload FROM accounts_rows WHERE property_id = %s AND id = %s", (pid, "CSV_ABD_029_9ff883"))
            ar = cur.fetchone()
        if ar:
            ap = ar["payload"] if isinstance(ar["payload"], dict) else json.loads(ar["payload"] or "{}")
            print()
            print("=== Account CSV_ABD_029_9ff883 (linked to Unmapped request) ===")
            for k in ["id", "name", "type", "email", "phone", "address"]:
                if ap.get(k) is not None:
                    print(f"  {k}: {ap.get(k)}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
