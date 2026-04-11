import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
FINANCIALS_URL = f"{BASE_URL}/api/financials"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30

def test_get_financials_with_property_id_filter():
    session = requests.Session()
    try:
        # Login to obtain session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text}"
        assert "user" in login_resp.json(), "Response JSON missing 'user' object after login"
        # Session cookie is handled automatically by requests.Session

        # Perform GET /api/financials with propertyId filter
        params = {"propertyId": PROPERTY_ID}
        financials_resp = session.get(FINANCIALS_URL, params=params, timeout=TIMEOUT)
        assert financials_resp.status_code == 200, f"Expected 200 OK but got {financials_resp.status_code} {financials_resp.text}"
        json_data = financials_resp.json()
        assert isinstance(json_data, list), f"Expected JSON array but got {type(json_data)}"
    finally:
        session.close()

test_get_financials_with_property_id_filter()