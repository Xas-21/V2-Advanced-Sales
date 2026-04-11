import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
REQUESTS_URL = f"{BASE_URL}/api/requests"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30


def test_get_requests_with_propertyId_filter():
    session = requests.Session()
    try:
        # Login to obtain session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_json = login_resp.json()
        assert "user" in login_json, "Login response missing 'user' object"
        assert "password" not in login_json["user"], "User object should not contain password"
        assert login_resp.cookies.get("session_id"), "Session cookie 'session_id' is missing"

        # Perform GET /api/requests with propertyId filter
        params = {"propertyId": PROPERTY_ID}
        get_resp = session.get(REQUESTS_URL, params=params, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"GET /api/requests returned status {get_resp.status_code}"
        data = get_resp.json()
        assert isinstance(data, list), f"Response JSON is not a list but {type(data)}"
    finally:
        session.close()


test_get_requests_with_propertyId_filter()