import requests

def test_post_api_login_rejects_wrong_password():
    url = "http://127.0.0.1:8000/api/login"
    payload = {
        "username": "Abdullah",
        "password": "wrongpassword"
    }
    headers = {
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 401, f"Expected status code 401 but got {response.status_code}"
    try:
        body = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert "detail" in body, "Response JSON should contain 'detail' field"
    assert isinstance(body["detail"], str) and len(body["detail"]) > 0, "'detail' field should be a non-empty string"

test_post_api_login_rejects_wrong_password()