import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
ROOMS_URL = f"{BASE_URL}/api/rooms"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30

def test_get_rooms_with_propertyId_filter():
    session = requests.Session()

    # Login to get session cookie
    login_payload = {"username": USERNAME, "password": PASSWORD}
    login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    assert "set-cookie" in login_resp.headers or "Set-Cookie" in login_resp.headers, "No Set-Cookie header in login response"

    # Perform GET /api/rooms with propertyId filter
    params = {"propertyId": PROPERTY_ID}
    resp = session.get(ROOMS_URL, params=params, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 but got {resp.status_code} for rooms GET"
    try:
        json_data = resp.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert isinstance(json_data, list), f"Expected JSON array but got {type(json_data)}"

test_get_rooms_with_propertyId_filter()