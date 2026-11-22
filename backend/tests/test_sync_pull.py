from test_sync_push import habit_row, log_row, push


def test_pull_is_strictly_incremental(client, auth_headers):
    push(client, auth_headers, habits=[habit_row(updated_at=1000)])

    assert len(push(client, auth_headers, last_synced_at=999)["habits"]) == 1
    # `updated_at > last_synced_at` is strict: equal timestamps are not re-sent.
    assert len(push(client, auth_headers, last_synced_at=1000)["habits"]) == 0
    assert len(push(client, auth_headers, last_synced_at=1001)["habits"]) == 0


def test_full_pull_returns_everything_including_tombstones(client, auth_headers):
    push(
        client,
        auth_headers,
        habits=[habit_row(habit_id="h1", updated_at=1000), habit_row(habit_id="h2", updated_at=1000, deleted=1)],
        habit_logs=[log_row(updated_at=1000)],
        derived_metrics=[
            {
                "id": "m1",
                "name": "Metric",
                "unit": None,
                "is_good": True,
                "formula": "a + b",
                "config_json": "{}",
                "updated_at": 1000,
                "deleted": 0,
            }
        ],
        plot_views=[
            {
                "id": "p1",
                "title": "Plot",
                "config_json": "{}",
                "sort_order": 0,
                "updated_at": 1000,
                "deleted": 0,
            }
        ],
    )
    body = push(client, auth_headers, last_synced_at=0)
    assert len(body["habits"]) == 2
    assert {h["deleted"] for h in body["habits"]} == {0, 1}
    assert len(body["habit_logs"]) == 1
    assert len(body["derived_metrics"]) == 1
    assert len(body["plot_views"]) == 1


def test_server_time_is_monotonic(client, auth_headers):
    first = push(client, auth_headers)
    second = push(client, auth_headers)
    assert second["server_time"] >= first["server_time"]


def test_pushed_rows_are_echoed_when_newer_than_cursor(client, auth_headers):
    push(client, auth_headers, habits=[habit_row(updated_at=5000)])
    echoed = push(client, auth_headers, last_synced_at=0)
    assert len(echoed["habits"]) == 1
    not_echoed = push(client, auth_headers, last_synced_at=5000)
    assert len(not_echoed["habits"]) == 0


def test_concurrent_device_merge(client, auth_headers):
    # Device A creates a habit, device B edits it later with a different name.
    push(client, auth_headers, habits=[habit_row(habit_id="shared", updated_at=1000, name="From A")])
    push(client, auth_headers, habits=[habit_row(habit_id="shared", updated_at=2000, name="From B")])
    body = push(client, auth_headers, last_synced_at=0)
    assert body["habits"][0]["name"] == "From B"
    assert body["habits"][0]["updated_at"] == 2000
