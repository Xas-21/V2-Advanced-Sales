import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/login"
TIMEOUT = 30

def test_post_api_login_rejects_missing_password():
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "username": "Abdullah"
    }
    try:
        response = requests.post(LOGIN_ENDPOINT, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 400, f"Expected status code 400, got {response.status_code}"
    try:
        body = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # FastAPI error detail is in 'detail' field, check it mentions password
    detail = body.get("detail", "")
    assert isinstance(detail, str), "'detail' field should be a string"
    assert "password" in detail.lower(), f"Error detail does not mention password: {detail}"

test_post_api_login_rejects_missing_password()