import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
USERS_URL = f"{BASE_URL}/api/users"
USERNAME = "Abdullah"
PASSWORD = "password123"
TIMEOUT = 30

def test_get_users_no_passwords():
    session = requests.Session()
    try:
        # Login to get session cookie for authenticated request
        login_resp = session.post(
            LOGIN_URL,
            json={"username": USERNAME, "password": PASSWORD},
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        assert "user" in login_resp.json(), "Login response missing user"
        # The user object should not contain password key on login success
        assert "password" not in login_resp.json().get("user", {}), "Password field should not be present in user after login"
        # Session cookie should be set
        cookies = login_resp.cookies.get_dict()
        assert any(cookie for cookie in cookies), "No cookies set after login"

        # Get users list
        users_resp = session.get(USERS_URL, timeout=TIMEOUT)
        assert users_resp.status_code == 200, f"GET {USERS_URL} returned {users_resp.status_code}"
        users_json = users_resp.json()
        assert isinstance(users_json, list), f"Response is not an array: {type(users_json)}"
        # Check that no user object contains password key
        for user in users_json:
            assert isinstance(user, dict), f"User item is not a dict: {user}"
            assert "password" not in user, f"User object contains password key: {user}"
    finally:
        session.close()

test_get_users_no_passwords()