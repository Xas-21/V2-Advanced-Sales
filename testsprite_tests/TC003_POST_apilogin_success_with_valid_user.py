import requests

def test_post_api_login_success_with_valid_user():
    base_url = "http://127.0.0.1:8000"
    login_url = f"{base_url}/api/login"
    payload = {
        "username": "Abdullah",
        "password": "password123"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(login_url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # Assert HTTP 200 OK
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

    # Assert Set-Cookie header with session_id present
    cookies = response.cookies
    assert "session_id" in cookies, "session_id cookie is not present in response"

    try:
        json_data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Assert user object present in JSON body
    user = json_data.get("user")
    assert isinstance(user, dict), "Response JSON does not contain 'user' object"

    # Assert 'password' field is not in user object
    assert "password" not in user, "'password' field should not be present in user object"

test_post_api_login_success_with_valid_user()