import requests

BASE_URL = "http://127.0.0.1:8000"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30

def test_get_venues_with_propertyId_filter():
    session = requests.Session()
    # Login to get session cookie for protected routes
    login_url = f"{BASE_URL}/api/login"
    login_payload = {"username": USERNAME, "password": PASSWORD}
    login_resp = session.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    assert "user" in login_resp.json()
    assert "password" not in login_resp.json()["user"]
    assert "session_id" in login_resp.cookies, "Session cookie missing after login"

    # Perform GET /api/venues with propertyId filter
    venues_url = f"{BASE_URL}/api/venues"
    params = {"propertyId": PROPERTY_ID}
    resp = session.get(venues_url, params=params, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Unexpected status code: {resp.status_code} {resp.text}"
    try:
        data = resp.json()
    except Exception as e:
        assert False, f"Response is not valid JSON: {e}"
    assert isinstance(data, list), f"Response JSON is not an array: {data}"

test_get_venues_with_propertyId_filter()