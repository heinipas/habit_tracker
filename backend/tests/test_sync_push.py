def habit_row(habit_id="h1", updated_at=1000, name="Cycling", deleted=0, **extra):
    row = {
        "id": habit_id,
        "name": name,
        "emoji": None,
        "data_type": "float",
        "unit": "km",
        "is_good": True,
        "default_value": 0,
        "widget_type": "counter",
        "config_json": "{}",
        "sort_order": 0,
        "updated_at": updated_at,
        "deleted": deleted,
    }
    row.update(extra)
    return row


def log_row(log_id="l1", habit_id="h1", date="2026-11-22", value=1.0, updated_at=1000, deleted=0):
    return {
        "id": log_id,
        "habit_id": habit_id,
        "date": date,
        "value": value,
        "updated_at": updated_at,
        "deleted": deleted,
    }


def push(client, auth_headers, **payload):
    payload.setdefault("last_synced_at", 0)
    response = client.post("/api/v1/sync", json=payload, headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_push_then_full_pull(client, auth_headers):
    push(client, auth_headers, habits=[habit_row()])
    body = push(client, auth_headers)
    assert len(body["habits"]) == 1
    assert body["habits"][0]["id"] == "h1"
    assert body["habits"][0]["name"] == "Cycling"
    assert body["habits"][0]["is_good"] is True


def test_last_write_wins_newer_replaces_older(client, auth_headers):
    push(client, auth_headers, habits=[habit_row(updated_at=1000, name="A")])
    push(client, auth_headers, habits=[habit_row(updated_at=2000, name="B")])
    # Older write must be ignored.
    push(client, auth_headers, habits=[habit_row(updated_at=1500, name="C")])
    body = push(client, auth_headers)
    assert len(body["habits"]) == 1
    assert body["habits"][0]["name"] == "B"
    assert body["habits"][0]["updated_at"] == 2000


def test_soft_delete_tombstone_propagates(client, auth_headers):
    push(client, auth_headers, habits=[habit_row(updated_at=1000)])
    push(client, auth_headers, habits=[habit_row(updated_at=2000, deleted=1)])
    body = push(client, auth_headers)
    assert len(body["habits"]) == 1
    assert body["habits"][0]["deleted"] == 1


def test_is_good_roundtrips_as_boolean(client, auth_headers):
    push(client, auth_headers, habits=[habit_row(is_good=False)])
    body = push(client, auth_headers)
    assert body["habits"][0]["is_good"] is False


def test_log_unique_pair_newer_row_replaces_older(client, auth_headers):
    push(client, auth_headers, habit_logs=[log_row(log_id="l1", value=5.0, updated_at=1000)])
    push(client, auth_headers, habit_logs=[log_row(log_id="l2", value=9.0, updated_at=2000)])

    body = push(client, auth_headers)
    assert len(body["habit_logs"]) == 1
    assert body["habit_logs"][0]["id"] == "l2"
    assert body["habit_logs"][0]["value"] == 9.0

    # An older row for the same pair must not resurrect the replaced row.
    push(client, auth_headers, habit_logs=[log_row(log_id="l3", value=1.0, updated_at=1500)])
    body = push(client, auth_headers)
    assert len(body["habit_logs"]) == 1
    assert body["habit_logs"][0]["id"] == "l2"


def test_all_four_tables_sync(client, auth_headers):
    push(
        client,
        auth_headers,
        habits=[habit_row()],
        habit_logs=[log_row()],
        derived_metrics=[
            {
                "id": "m1",
                "name": "Avg Speed",
                "unit": "km/h",
                "is_good": True,
                "formula": "bike_km / (sport_mins / 60)",
                "config_json": "{}",
                "updated_at": 1000,
                "deleted": 0,
            }
        ],
        plot_views=[
            {
                "id": "p1",
                "title": "Weekly",
                "config_json": "{}",
                "sort_order": 0,
                "updated_at": 1000,
                "deleted": 0,
            }
        ],
    )
    body = push(client, auth_headers)
    assert len(body["habits"]) == 1
    assert len(body["habit_logs"]) == 1
    assert len(body["derived_metrics"]) == 1
    assert body["derived_metrics"][0]["formula"].startswith("bike_km")
    assert len(body["plot_views"]) == 1
    assert body["plot_views"][0]["title"] == "Weekly"
