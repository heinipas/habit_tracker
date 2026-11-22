#!/usr/bin/env python3
"""Container entrypoint.

The data directory is a host bind mount whose owner cannot be predicted, so the
container starts as root to fix its ownership, drops to the unprivileged `app`
user, and only then execs uvicorn. When running with a `user:` override in
compose, ownership is assumed to be correct and both steps are skipped.
"""
import os
import pwd
import subprocess

RUNTIME_USER = "app"
UVICORN_CMD = ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]


def main() -> None:
    db_path = os.environ.get("DB_PATH", "/app/data/habits.sqlite")
    data_dir = os.path.dirname(os.path.abspath(db_path)) or "/app/data"

    if os.getuid() != 0:
        # `user:` override in compose — ownership assumed to be correct.
        os.execvp(UVICORN_CMD[0], UVICORN_CMD)

    os.makedirs(data_dir, exist_ok=True)
    subprocess.run(
        ["chown", "-R", f"{RUNTIME_USER}:{RUNTIME_USER}", data_dir], check=True
    )

    account = pwd.getpwnam(RUNTIME_USER)
    os.setgroups([])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    os.environ["HOME"] = account.pw_dir

    os.execvp(UVICORN_CMD[0], UVICORN_CMD)


if __name__ == "__main__":
    main()
