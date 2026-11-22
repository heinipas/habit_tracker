import sqlite3
import time
from typing import Any

from .db import connect
from .models import (
    DerivedMetricRow,
    HabitLogRow,
    HabitRow,
    PlotViewRow,
    SyncRequest,
    SyncResponse,
)

HABIT_COLUMNS = [
    "id", "name", "emoji", "data_type", "unit", "is_good", "default_value",
    "widget_type", "config_json", "sort_order", "updated_at", "deleted",
]
HABIT_LOG_COLUMNS = [
    "id", "habit_id", "date", "value", "updated_at", "deleted",
]
DERIVED_METRIC_COLUMNS = [
    "id", "name", "emoji", "unit", "is_good", "formula", "config_json",
    "updated_at", "deleted",
]
PLOT_VIEW_COLUMNS = [
    "id", "title", "emoji", "config_json", "sort_order", "updated_at", "deleted",
]


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def _upsert(
    conn: sqlite3.Connection,
    table: str,
    columns: list[str],
    data: dict[str, Any],
) -> None:
    """Insert a row, or update it only when the incoming `updated_at` is newer (LWW)."""
    placeholders = ", ".join("?" for _ in columns)
    column_list = ", ".join(columns)
    assignments = ", ".join(
        f"{column} = excluded.{column}" for column in columns if column != "id"
    )
    conn.execute(
        f"INSERT INTO {table} ({column_list}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {assignments} "
        f"WHERE excluded.updated_at > {table}.updated_at",
        [data[column] for column in columns],
    )


def _upsert_habit_log(conn: sqlite3.Connection, data: dict[str, Any]) -> None:
    """Upsert a log row, honouring UNIQUE(habit_id, date): the newer row wins."""
    try:
        _upsert(conn, "habit_logs", HABIT_LOG_COLUMNS, data)
    except sqlite3.IntegrityError:
        # Either another row owns this (habit_id, date) pair, or a row with
        # this primary key holds a different pair. Newest row wins: free both
        # constraints, then insert. This runs inside run_sync's transaction,
        # so any failure below rolls the whole sync back — nothing is lost.
        existing = conn.execute(
            "SELECT id, updated_at FROM habit_logs WHERE habit_id = ? AND date = ?",
            (data["habit_id"], data["date"]),
        ).fetchone()
        if existing is not None and data["updated_at"] <= existing["updated_at"]:
            # Older/equal incoming row: keep the current owner of the pair.
            return
        if existing is not None:
            conn.execute("DELETE FROM habit_logs WHERE id = ?", (existing["id"],))
        # The row with this primary key may still hold a different pair.
        conn.execute("DELETE FROM habit_logs WHERE id = ?", (data["id"],))
        placeholders = ", ".join("?" for _ in HABIT_LOG_COLUMNS)
        column_list = ", ".join(HABIT_LOG_COLUMNS)
        conn.execute(
            f"INSERT INTO habit_logs ({column_list}) VALUES ({placeholders})",
            [data[column] for column in HABIT_LOG_COLUMNS],
        )


def _read_rows(
    conn: sqlite3.Connection, table: str, columns: list[str], since: int
) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"SELECT {', '.join(columns)} FROM {table} WHERE updated_at > ? ORDER BY updated_at",
        (since,),
    ).fetchall()
    result: list[dict[str, Any]] = []
    for row in rows:
        data = {column: row[column] for column in columns}
        if "is_good" in data:
            data["is_good"] = bool(data["is_good"])
        if "deleted" in data:
            data["deleted"] = int(data["deleted"])
        result.append(data)
    return result


def run_sync(db_path: str, request: SyncRequest) -> SyncResponse:
    conn = connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            # Captured before the upserts so rows committed concurrently by
            # another device are never skipped by the client's next pull.
            server_time = now_ms()

            for row in request.habits:
                _upsert(conn, "habits", HABIT_COLUMNS, row.model_dump())
            for row in request.habit_logs:
                _upsert_habit_log(conn, row.model_dump())
            for row in request.derived_metrics:
                _upsert(conn, "derived_metrics", DERIVED_METRIC_COLUMNS, row.model_dump())
            for row in request.plot_views:
                _upsert(conn, "plot_views", PLOT_VIEW_COLUMNS, row.model_dump())

            since = max(request.last_synced_at, 0)
            habits = _read_rows(conn, "habits", HABIT_COLUMNS, since)
            habit_logs = _read_rows(conn, "habit_logs", HABIT_LOG_COLUMNS, since)
            derived_metrics = _read_rows(conn, "derived_metrics", DERIVED_METRIC_COLUMNS, since)
            plot_views = _read_rows(conn, "plot_views", PLOT_VIEW_COLUMNS, since)

            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    finally:
        conn.close()

    return SyncResponse(
        server_time=server_time,
        habits=[HabitRow(**data) for data in habits],
        habit_logs=[HabitLogRow(**data) for data in habit_logs],
        derived_metrics=[DerivedMetricRow(**data) for data in derived_metrics],
        plot_views=[PlotViewRow(**data) for data in plot_views],
    )
