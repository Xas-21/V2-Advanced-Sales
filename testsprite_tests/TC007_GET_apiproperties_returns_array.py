import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
PROPERTIES_URL = f"{BASE_URL}/api/properties"
USERNAME = "Abdullah"
PASSWORD = "password123"
TIMEOUT = 30


def login_get_session():
    login_data = {"username": USERNAME, "password": PASSWORD}
    session = requests.Session()
    response = session.post(LOGIN_URL, json=login_data, timeout=TIMEOUT)
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    assert "session_id" in response.cookies, "Session cookie not set after login"
    return session


def test_get_properties_returns_array():
    session = login_get_session()
    response = session.get(PROPERTIES_URL, timeout=TIMEOUT)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    try:
        json_data = response.json()
    except Exception as e:
        assert False, f"Response is not valid JSON: {e}"

    assert isinstance(json_data, list), f"Expected response to be a list but got {type(json_data)}"


test_get_properties_returns_array()