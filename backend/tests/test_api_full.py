"""
Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live server).
Run from backend folder: pytest tests/ -v
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# Seed property id present in data/properties.json (stable for GET filters)
PROP_ID = "P5jj48x718"


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_login_success_sets_cookie_and_user_shape():
    r = client.post(
        "/api/login",
        json={"username": "Abdullah", "password": "password123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "user" in data
    assert data["user"].get("username") == "Abdullah"
    assert "password" not in data["user"]
    assert "session_id" in r.cookies


def test_login_invalid():
    r = client.post(
        "/api/login",
        json={"username": "Abdullah", "password": "wrong"},
    )
    assert r.status_code == 401
    assert "detail" in r.json()


def test_login_missing_password():
    r = client.post("/api/login", json={"username": "Abdullah"})
    assert r.status_code == 400
    assert "password" in str(r.json().get("detail", "")).lower()


def test_get_users():
    r = client.get("/api/users")
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    for u in users:
        assert "password" not in u


def test_get_properties():
    r = client.get("/api/properties")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_rooms_filtered():
    r = client.get("/api/rooms", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_venues_filtered():
    r = client.get("/api/venues", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_taxes_filtered():
    r = client.get("/api/taxes", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)


def test_get_financials_filtered():
    r = client.get("/api/financials", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_requests_filtered():
    r = client.get("/api/requests", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_crm_state():
    r = client.get("/api/crm-state", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    data = r.json()
    assert data.get("propertyId") == PROP_ID
    assert "leads" in data


def test_requests_post_then_delete():
    payload = {
        "propertyId": PROP_ID,
        "type": "accommodation",
        "status": "draft",
        "guestName": "Pytest Guest",
    }
    r = client.post("/api/requests", json=payload)
    assert r.status_code == 200
    created = r.json()
    rid = created.get("id")
    assert rid
    d = client.delete(f"/api/requests/{rid}")
    assert d.status_code == 200


def test_crm_state_post_roundtrip():
    r_get = client.get("/api/crm-state", params={"propertyId": PROP_ID})
    assert r_get.status_code == 200
    prev = r_get.json()
    leads = prev.get("leads") or {}
    # minimal write: same structure back
    r_post = client.post(
        "/api/crm-state",
        json={
            "propertyId": PROP_ID,
            "leads": leads,
            "accountActivities": prev.get("accountActivities") or {},
        },
    )
    assert r_post.status_code == 200
    assert r_post.json().get("propertyId") == PROP_ID
