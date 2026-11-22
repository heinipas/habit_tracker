# Self-Hosting the Sync Server

The sync server is a single Docker container with a YAML-only configuration—no `.env`
files, no runtime dependencies to install. This guide covers deployment, updates, and
backups. Networking (Tailscale / future tunnels) is covered separately in
[networking.md](./networking.md).

## Prerequisites

- A host with Docker + `docker compose` (Raspberry Pi, NAS, any Linux server).
- The published image: `ghcr.io/heinipas/habit-sync-server:latest`
  (multi-arch: `linux/arm64`, `linux/armv7`-class Pi images via `arm64`, and `linux/amd64`).

## 1. Configure and start

Create a folder, place [`docker-compose.yml`](../docker-compose.yml) in it, and edit it:

```yaml
services:
  habit-sync-server:
    image: ghcr.io/heinipas/habit-sync-server:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8090:8080"   # loopback only; see networking.md
    environment:
      - API_KEY=change_this_to_a_strong_secret   # required, long random string
      - CORS_ORIGINS=https://heinipas.github.io  # frontend origin (scheme+host only)
      - DB_PATH=/app/data/habits.sqlite
    volumes:
      - ./data:/app/data
```

Then:

```bash
docker compose pull
docker compose up -d
docker compose logs -f habit-sync-server   # Ctrl-C to stop following
```

## 2. Verify

```bash
curl http://127.0.0.1:8090/api/v1/health
# {"status":"ok","server_time":1763856000000,"version":"0.1.0"}
```

In the app: **Settings → Sync Server URL** (e.g. `https://raspberrypi.<n>.ts.net`,
or `http://<host-ip>:8090` for LAN-only plain HTTP—browsers only allow plain HTTP from
`http://` frontends), **API Key** → Save → **Sync Now** → green dot.

## 3. Update

```bash
docker compose pull
docker compose up -d
```

The SQLite database lives in `./data/` and survives container recreation.

## 4. Backup

The entire database is one file:

```bash
# Stop-free snapshot (SQLite WAL is checkpointed by the backup API):
docker compose exec habit-sync-server python -c \
  "import sqlite3; s=sqlite3.connect('/app/data/habits.sqlite'); d=sqlite3.connect('backup.sqlite'); s.backup(d)"
```

Or stop the container and copy `./data/habits.sqlite`. Restoring = stop container,
replace the file, start container.

## 5. Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `API_KEY` | ✅ | — | Bearer token for `POST /api/v1/sync`; server refuses to start without it |
| `CORS_ORIGINS` | recommended | *(none)* | Comma-separated frontend origins allowed by the browser (CORS). Without it, browser sync is blocked (curl still works) |
| `DB_PATH` | no | `/app/data/habits.sqlite` | SQLite file location inside the container |
| `APP_VERSION` | no | `dev` | Version string reported by `/api/v1/health` (set automatically in published images) |

## 6. Building the image from source (optional)

```bash
docker build -t habit-sync-server:local backend/
# run it via compose by replacing `image:` with `build: ./backend`
```
