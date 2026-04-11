import requests
import json

try:
    response = requests.get("http://localhost:8000/api/users")
    print(f"Status: {response.status_code}")
    print(f"Body: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
