import datetime as dt
from collections import Counter
from typing import Any, Dict, List

import httpx

BASE_URL = "http://127.0.0.1:8000"


def jget(client: httpx.Client, path: str):
    res = client.get(f"{BASE_URL}{path}")
    res.raise_for_status()
    return res.json()


def jpost(client: httpx.Client, path: str, payload: Dict[str, Any]):
    res = client.post(f"{BASE_URL}{path}", json=payload)
    res.raise_for_status()
    return res.json()


def jput(client: httpx.Client, path: str, payload: Dict[str, Any]):
    res = client.put(f"{BASE_URL}{path}", json=payload)
    res.raise_for_status()
    return res.json()


def jdelete(client: httpx.Client, path: str):
    res = client.delete(f"{BASE_URL}{path}")
    res.raise_for_status()
    return res.json()


def make_account(account_id: str, name: str, owner: Dict[str, Any], property_id: str, city: str, typ: str):
    return {
        "id": account_id,
        "name": name,
        "type": typ,
        "city": city,
        "country": "Saudi Arabia",
        "propertyId": property_id,
        "createdByUserId": owner["id"],
        "createdByUsername": owner.get("username"),
        "ownerUserId": owner["id"],
        "ownerUsername": owner.get("username"),
        "contacts": [],
        "activities": [],
    }


def make_request(
    req_id: str,
    title: str,
    account: Dict[str, Any],
    creator: Dict[str, Any],
    property_id: str,
    idx: int,
):
    today = dt.date.today()
    check_in = today + dt.timedelta(days=idx + 2)
    check_out = check_in + dt.timedelta(days=2)
    nights = (check_out - check_in).days
    is_event = idx % 3 == 0

    return {
        "id": req_id,
        "requestName": title,
        "requestType": "Event" if is_event else "Accommodation",
        "status": "Inquiry" if idx % 2 == 0 else "Tentative",
        "propertyId": property_id,
        "createdByUserId": creator["id"],
        "accountId": account["id"],
        "accountName": account["name"],
        "account": account["name"],
        "segment": account.get("type", ""),
        "receivedDate": str(today),
        "checkIn": str(check_in),
        "checkOut": str(check_out),
        "nights": nights,
        "rooms": [] if is_event else [{"id": f"RM_{req_id}", "type": "Deluxe", "occupancy": "Double", "count": 2 + (idx % 3), "rate": 700 + (idx * 25)}],
        "agenda": [{"id": f"AG_{req_id}", "startDate": str(check_in), "endDate": str(check_in), "venue": "Conference Hall A", "shape": "Theater", "pax": 40 + idx}] if is_event else [],
        "transportation": [],
        "invoices": {"inv1": None, "inv2": None, "inv3": None, "agreement": None},
        "payments": [{"id": f"PAY_{req_id}", "method": "Bank Transfer" if idx % 2 == 0 else "Cash", "amount": 1500 + (idx * 300), "date": str(today)}],
        "logs": [{"date": f"{today}T10:00:00Z", "user": creator.get("username"), "action": "Request Created"}],
        "totalCost": f"{(6000 + idx * 800):.2f}",
        "paidAmount": f"{(1500 + idx * 300):.2f}",
        "totalRooms": 0 if is_event else (2 + (idx % 3)),
        "adr": 0 if is_event else (700 + (idx * 25)),
        "paymentStatus": "Deposit",
    }


def main():
    client = httpx.Client(timeout=30.0)
    health = jget(client, "/api/health")
    if health.get("storage") != "postgres":
        raise RuntimeError(f"Backend not in postgres mode: {health}")

    users = jget(client, "/api/users")
    properties = jget(client, "/api/properties")

    abdullah = next((u for u in users if str(u.get("username")) == "Abdullah"), None)
    sultan = next((u for u in users if str(u.get("username")) == "Sultan.jan"), None)
    shaden = next((p for p in properties if "Shaden" in str(p.get("name", ""))), None)
    if not abdullah or not sultan or not shaden:
        raise RuntimeError("Missing Abdullah/Sultan/Shaden in system.")

    shaden_id = str(shaden["id"])
    assigned = list(dict.fromkeys([*(shaden.get("assignedUserIds") or []), abdullah["id"], sultan["id"]]))
    jpost(client, "/api/properties", {**shaden, "assignedUserIds": assigned})

    # 5 Abdullah + 10 Sultan accounts
    abd_accounts = [
        make_account(f"A_ABD_{i:02d}", f"ABD Account {i}", abdullah, shaden_id, city, typ)
        for i, (city, typ) in enumerate(
            [
                ("AlUla", "Corporate"),
                ("Riyadh", "Travel Agency"),
                ("Jeddah", "DMC"),
                ("Khobar", "MICE"),
                ("Medina", "Government"),
            ],
            start=1,
        )
    ]
    sultan_accounts = [
        make_account(f"A_SUL_{i:02d}", f"SUL Account {i}", sultan, shaden_id, city, typ)
        for i, (city, typ) in enumerate(
            [
                ("AlUla", "Corporate"),
                ("Riyadh", "Travel Agency"),
                ("Jeddah", "DMC"),
                ("Dammam", "MICE"),
                ("Tabuk", "Wholesale"),
                ("Abha", "Corporate"),
                ("Taif", "Travel Agency"),
                ("Hail", "DMC"),
                ("Yanbu", "MICE"),
                ("Mecca", "Government"),
            ],
            start=1,
        )
    ]
    all_accounts = [*abd_accounts, *sultan_accounts]
    jput(client, "/api/accounts/sync", {"propertyId": shaden_id, "accounts": all_accounts})

    # Clear Shaden requests, then create 15 (10 Sultan + 5 Abdullah)
    existing_requests = jget(client, f"/api/requests?propertyId={shaden_id}")
    for row in existing_requests:
        jdelete(client, f"/api/requests/{row['id']}")

    abd_requests = [
        make_request(f"REQ_ABD_{i:02d}", f"Abdullah Request {i}", abd_accounts[(i - 1) % len(abd_accounts)], abdullah, shaden_id, i)
        for i in range(1, 6)
    ]
    sul_requests = [
        make_request(f"REQ_SUL_{i:02d}", f"Sultan Request {i}", sultan_accounts[(i - 1) % len(sultan_accounts)], sultan, shaden_id, i + 5)
        for i in range(1, 11)
    ]
    for req in [*abd_requests, *sul_requests]:
        jpost(client, "/api/requests", req)

    # Sales calls in CRM state for both users
    sales_calls = {
        "A_ABD_01": [
            {"id": "CALL_ABD_01", "type": "sales_call", "date": str(dt.date.today()), "user": "Abdullah", "userId": abdullah["id"], "notes": "Follow-up with corporate client"},
            {"id": "CALL_ABD_02", "type": "sales_call", "date": str(dt.date.today()), "user": "Abdullah", "userId": abdullah["id"], "notes": "Discussed room block and rates"},
        ],
        "A_SUL_01": [
            {"id": "CALL_SUL_01", "type": "sales_call", "date": str(dt.date.today()), "user": "Sultan.jan", "userId": sultan["id"], "notes": "Event package alignment"},
            {"id": "CALL_SUL_02", "type": "sales_call", "date": str(dt.date.today()), "user": "Sultan.jan", "userId": sultan["id"], "notes": "Venue availability confirmation"},
            {"id": "CALL_SUL_03", "type": "sales_call", "date": str(dt.date.today()), "user": "Sultan.jan", "userId": sultan["id"], "notes": "Final price negotiation"},
        ],
    }
    leads_new = [
        {"id": "LEAD_ABD_01", "accountId": "A_ABD_01", "company": "ABD Account 1", "value": 25000, "stage": "new", "ownerUserId": abdullah["id"], "propertyId": shaden_id, "nextActionDate": str(dt.date.today() + dt.timedelta(days=3))},
        {"id": "LEAD_SUL_01", "accountId": "A_SUL_01", "company": "SUL Account 1", "value": 42000, "stage": "new", "ownerUserId": sultan["id"], "propertyId": shaden_id, "nextActionDate": str(dt.date.today() + dt.timedelta(days=2))},
    ]
    jpost(
        client,
        "/api/crm-state",
        {
            "propertyId": shaden_id,
            "leads": {"new": leads_new, "qualified": [], "proposal": [], "negotiation": [], "won": [], "notInterested": []},
            "accountActivities": sales_calls,
        },
    )

    # Add/refresh KPI style financial entry (budget + forecast)
    jpost(
        client,
        "/api/financials",
        {
            "id": "FIN_SHADEN_2026_MAIN",
            "propertyId": shaden_id,
            "year": 2026,
            "month": 4,
            "budget": 1850000,
            "forecastRevenue": 2140000,
            "kpiTargetOcc": 78,
            "kpiTargetAdr": 910,
        },
    )

    # Final verification snapshot
    accounts = jget(client, f"/api/accounts?propertyId={shaden_id}")
    requests = jget(client, f"/api/requests?propertyId={shaden_id}")
    crm = jget(client, f"/api/crm-state?propertyId={shaden_id}")
    financials = jget(client, f"/api/financials?propertyId={shaden_id}")

    acc_by_user = Counter(str(a.get("createdByUserId")) for a in accounts)
    req_by_user = Counter(str(r.get("createdByUserId")) for r in requests)

    call_by_user = Counter()
    activities = crm.get("accountActivities") if isinstance(crm, dict) else {}
    if isinstance(activities, dict):
        for _, rows in activities.items():
            if not isinstance(rows, list):
                continue
            for entry in rows:
                user_id = str(entry.get("userId") or "")
                if user_id:
                    call_by_user[user_id] += 1

    print("=== SEED RESULT (Shaden) ===")
    print("propertyId:", shaden_id)
    print("accounts_total:", len(accounts))
    print("requests_total:", len(requests))
    print("financial_rows:", len(financials))
    print("accounts_by_user:", dict(acc_by_user))
    print("requests_by_user:", dict(req_by_user))
    print("sales_calls_by_userId:", dict(call_by_user))
    print("budget_forecast_row:", next((f for f in financials if str(f.get("id")) == "FIN_SHADEN_2026_MAIN"), {}))
    print("expected_user_map:", {"Abdullah": abdullah["id"], "Sultan.jan": sultan["id"]})


if __name__ == "__main__":
    main()
