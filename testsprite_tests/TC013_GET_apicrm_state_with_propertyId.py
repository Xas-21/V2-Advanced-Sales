import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
CRM_STATE_URL = f"{BASE_URL}/api/crm-state"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30

def test_tc013_get_crm_state_with_propertyId():
    session = requests.Session()
    try:
        # Login to get session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        assert "session_id" in login_resp.cookies, "Missing session_id cookie after login"
        login_json = login_resp.json()
        assert "user" in login_json, "Missing 'user' in login response"
        assert "password" not in login_json.get("user", {}), "Password field present in user object"

        # GET /api/crm-state with propertyId
        params = {"propertyId": PROPERTY_ID}
        resp = session.get(CRM_STATE_URL, params=params, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected status 200, got {resp.status_code}"
        data = resp.json()

        # Validate presence of propertyId in response JSON
        assert "propertyId" in data, "Response JSON missing 'propertyId'"
        assert data["propertyId"] == PROPERTY_ID, f"propertyId mismatch: expected {PROPERTY_ID}, got {data['propertyId']}"

        # Validate leads object exists and has correct buckets as keys with arrays
        assert "leads" in data, "Response JSON missing 'leads'"
        leads = data["leads"]
        assert isinstance(leads, dict), "'leads' is not a object/dict"

        expected_buckets = {"new", "qualified", "proposal", "negotiation", "won", "notInterested"}
        buckets_keys = set(leads.keys())
        assert buckets_keys.issubset(expected_buckets), f"Unexpected keys in leads: {buckets_keys - expected_buckets}"

        for bucket in buckets_keys:
            assert isinstance(leads[bucket], list), f"Leads bucket '{bucket}' is not an array/list"

        # Validate accountActivities exists (type can be object/array depending on implementation, validate exists)
        assert "accountActivities" in data, "Response JSON missing 'accountActivities'"

    finally:
        session.close()

test_tc013_get_crm_state_with_propertyId()