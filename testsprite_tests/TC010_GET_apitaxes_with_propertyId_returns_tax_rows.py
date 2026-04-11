import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
TAXES_URL = f"{BASE_URL}/api/taxes"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30


def test_get_taxes_with_propertyId_returns_tax_rows():
    session = requests.Session()
    try:
        # Login to get session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        assert "set-cookie" in login_resp.headers or "Set-Cookie" in login_resp.headers, "Session cookie not set on login"

        # GET /api/taxes?propertyId=P5jj48x718
        params = {"propertyId": PROPERTY_ID}
        resp = session.get(TAXES_URL, params=params, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200 OK but got {resp.status_code}"

        # Validate JSON response is an array
        data = resp.json()
        assert isinstance(data, list), f"Expected response to be a list, got {type(data)}"

    finally:
        session.close()


test_get_taxes_with_propertyId_returns_tax_rows()