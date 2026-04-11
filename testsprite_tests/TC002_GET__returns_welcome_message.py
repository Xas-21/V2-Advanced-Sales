import requests

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30

def test_get_root_returns_welcome_message():
    url = f"{BASE_URL}/"
    try:
        response = requests.get(url, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        raise AssertionError(f"Request to {url} failed: {e}")

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
    try:
        json_data = response.json()
    except ValueError:
        raise AssertionError("Response is not valid JSON")

    assert "message" in json_data, "Response JSON does not contain 'message' field"

test_get_root_returns_welcome_message()