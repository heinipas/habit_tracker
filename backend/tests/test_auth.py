def test_health_is_open_and_reports_version(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["server_time"], int)
    assert body["version"] == "0.0.0-test"


def test_sync_requires_authorization_header(client):
    response = client.post("/api/v1/sync", json={"last_synced_at": 0})
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_sync_rejects_wrong_key(client):
    response = client.post(
        "/api/v1/sync",
        json={"last_synced_at": 0},
        headers={"Authorization": "Bearer wrong-key"},
    )
    assert response.status_code == 401


def test_sync_accepts_valid_key(client, auth_headers):
    response = client.post(
        "/api/v1/sync",
        json={"last_synced_at": 0},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert set(response.json().keys()) == {
        "server_time",
        "habits",
        "habit_logs",
        "derived_metrics",
        "plot_views",
    }


def test_sync_ignores_extra_client_fields(client, auth_headers):
    # The client sends the local-only `synced` flag; it must not break validation.
    response = client.post(
        "/api/v1/sync",
        json={
            "last_synced_at": 0,
            "habits": [
                {
                    "id": "h1",
                    "name": "Cycling",
                    "data_type": "float",
                    "unit": "km",
                    "is_good": True,
                    "default_value": 0,
                    "widget_type": "counter",
                    "config_json": "{}",
                    "updated_at": 1000,
                    "deleted": 0,
                    "synced": 0,
                }
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert len(response.json()["habits"]) == 1
    # The `synced` field must not be echoed back.
    assert "synced" not in response.json()["habits"][0]
