import sqlite3
from pathlib import Path

# Mirrors the client IndexedDB schema (frontend/src/db/db.ts) minus the
# local-only `synced` flag. All synced tables use client-generated UUIDs,
# millisecond `updated_at` timestamps and soft-delete tombstones.
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS habits (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    emoji         TEXT,
    data_type     TEXT NOT NULL,
    unit          TEXT,
    is_good       INTEGER NOT NULL DEFAULT 1,
    default_value REAL,
    widget_type   TEXT NOT NULL,
    config_json   TEXT NOT NULL DEFAULT '{}',
    sort_order    INTEGER,
    updated_at    INTEGER NOT NULL,
    deleted       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habit_logs (
    id         TEXT PRIMARY KEY,
    habit_id   TEXT NOT NULL,
    date       TEXT NOT NULL,
    value      REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (habit_id, date)
);

CREATE TABLE IF NOT EXISTS derived_metrics (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    emoji       TEXT,
    unit        TEXT,
    is_good     INTEGER NOT NULL DEFAULT 1,
    formula     TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plot_views (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    emoji       TEXT,
    config_json TEXT NOT NULL DEFAULT '{}',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);
"""


def connect(db_path: str) -> sqlite3.Connection:
    if db_path != ":memory:":
        Path(db_path).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
