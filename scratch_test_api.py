import requests

try:
    response = requests.post(
        "http://localhost:8000/api/public-inquiry",
        json={"name": "test", "email": "test@test.com", "project_name": "test", "message": "test"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
