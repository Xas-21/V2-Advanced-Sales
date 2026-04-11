import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
REQUESTS_URL = f"{BASE_URL}/api/requests"

USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30

def test_post_request_create_then_delete():
    session = requests.Session()
    try:
        # Login to get authenticated session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        assert "session_id" in login_resp.cookies, "Session cookie not set on login"
        login_json = login_resp.json()
        assert "user" in login_json, "Response JSON missing 'user' key"
        assert "password" not in login_json["user"], "User object should not contain password field"

        # Create a new request
        create_payload = {
            "propertyId": PROPERTY_ID,
            "type": "accommodation",
            "status": "draft"
        }
        create_resp = session.post(REQUESTS_URL, json=create_payload, timeout=TIMEOUT)
        assert create_resp.status_code == 200, f"Request creation failed with status {create_resp.status_code}"
        create_json = create_resp.json()
        assert isinstance(create_json, dict), "Create response is not a JSON object"
        assert "id" in create_json, "Create response missing 'id' field"
        request_id = create_json["id"]
        assert isinstance(request_id, str) and request_id.strip(), "Invalid id returned"

        # Delete the created request
        delete_url = f"{REQUESTS_URL}/{request_id}"
        delete_resp = session.delete(delete_url, timeout=TIMEOUT)
        assert delete_resp.status_code in [200, 204], f"Delete failed with status {delete_resp.status_code}"
        # Optional: check no error 'detail' in response on delete if json response is provided
        try:
            delete_json = delete_resp.json()
            assert "detail" not in delete_json, f"Error detail in delete response: {delete_json.get('detail')}"
        except ValueError:
            # No json response, assume success if status code is 200 or 204
            pass

    finally:
        # Cleanup: Attempt to delete in case test failed after creation
        if 'request_id' in locals():
            session.delete(f"{REQUESTS_URL}/{request_id}", timeout=TIMEOUT)

test_post_request_create_then_delete()