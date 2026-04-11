import requests

BASE_URL = "http://127.0.0.1:8000"

def test_get_api_health_returns_ok_status():
    url = f"{BASE_URL}/api/health"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /api/health request failed: {e}"
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    try:
        json_data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert "status" in json_data, "Response JSON missing 'status' key"
    assert json_data["status"] == "ok", f"Expected status 'ok', got '{json_data['status']}'"

test_get_api_health_returns_ok_status()