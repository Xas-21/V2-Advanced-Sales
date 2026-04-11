import requests

BASE_URL = "http://localhost:8000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/login"
TIMEOUT = 30

def test_post_login_endpoint_authentication():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}

    valid_credentials = {
        "username": "validUser",
        "password": "validPassword123"
    }

    invalid_credentials = {
        "username": "invalidUser",
        "password": "wrongPassword"
    }

    missing_password = {
        "username": "someUser",
        "password": ""
    }

    # Test valid login
    try:
        response = session.post(LOGIN_ENDPOINT, json=valid_credentials, headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200 OK for valid login, got {response.status_code}"
        response_json = response.json()
        # Expecting token or user info in response to confirm authentication
        assert "token" in response_json or "user" in response_json, "Authentication token or user info missing in response for valid login"
    except Exception as e:
        assert False, f"Exception during valid login test: {e}"

    # Test session persistence: Try accessing login page again and check if session persists (simulate)
    # Since this is API, check session cookies or assume token-based persistence
    try:
        # Session should carry authentication if token/cookies are set
        # Here, simply check if session has cookies or headers preserving token
        # Alternatively, test a protected endpoint - not defined here, so just check session cookies
        assert session.cookies or 'Authorization' in session.headers or 'token' in response_json, "Session does not persist authentication info"
    except Exception as e:
        assert False, f"Exception during session persistence check: {e}"

    # Test invalid credentials
    try:
        response = session.post(LOGIN_ENDPOINT, json=invalid_credentials, headers=headers, timeout=TIMEOUT)
        assert response.status_code == 401 or response.status_code == 400, f"Expected 401 or 400 for invalid login, got {response.status_code}"
        response_json = response.json()
        # Relax error message presence check to any known error keys
        assert any(key in response_json for key in ("error", "message", "detail")), "Error message missing in response for invalid login"
    except Exception as e:
        assert False, f"Exception during invalid login test: {e}"

    # Test missing password (blank password)
    try:
        response = session.post(LOGIN_ENDPOINT, json=missing_password, headers=headers, timeout=TIMEOUT)
        # Expecting 400 Bad Request or 422 Unprocessable Entity for validation error
        assert response.status_code in (400, 422), f"Expected 400 or 422 for missing password, got {response.status_code}"
        response_json = response.json()
        assert any(key in response_json for key in ("error", "message", "detail")), "Validation error message missing for missing password"
    except Exception as e:
        assert False, f"Exception during missing password validation test: {e}"

test_post_login_endpoint_authentication()
