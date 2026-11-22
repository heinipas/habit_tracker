# Sprint 2 Specification: Sync Server, Docker & Deployment

## 1. Overview & Objectives

The goal of **Sprint 2** is to turn the local-only MVP from [sprint_01.md](./sprint_01.md) into a multi-device, self-hosted, local-first app: a Dockerized sync server with a single batch-sync endpoint, a background sync client in the frontend, a visible connection/sync status indicator, and a working deployment on a Raspberry Pi reached over **Tailscale VPN (`tailscale serve`)**.

> **Networking decision (updated):** For now the Raspberry Pi is reached via a **Tailscale tailnet** (`https://raspberrypi.<tailscale_number>.ts.net`, HTTPS terminated by `tailscale serve`). No Cloudflare Tunnel in this sprint. The networking guide must stay **provider-agnostic** so we can switch to **Tailscale Funnel** or **Cloudflare Tunnel** later without touching application code—only the *Sync Server URL* in Settings changes.

### Core Deliverables
1. **Backend REST API:** FastAPI sync server implementing `POST /api/v1/sync` (Last-Write-Wins batch sync), `GET /api/v1/health`, Bearer-token auth, and configurable CORS.
2. **SQLite Schema:** Server-side mirror of the four synced tables (`habits`, `habit_logs`, `derived_metrics`, `plot_views`) with tombstones and `updated_at` conflict resolution.
3. **Sync Client:** Frontend sync engine with Settings UI (`Server URL`, `API Key`, `Sync Now`, `Force Pull`, `Force Push`) and automatic triggers (app open, focus/`visibilitychange`, debounced after local edits, browser `online` event).
4. **Connection & Sync Status Indicator:** Status dot in the top-right header—green when connected, gently pulsing while a sync is in flight, orange when disconnected, red on error—clickable to reveal a popover with server info (host, version, last sync) and a summary of unsynced changes plus a manual *Sync Now* button.
5. **Containerization:** `Dockerfile` + YAML-only `docker-compose.yml` (no `.env` files), bind-mounted SQLite volume.
6. **CI/CD:** GitHub Actions workflow publishing a **multi-arch** (ARM64 + AMD64) backend image to GHCR; existing Pages workflow keeps deploying the frontend.
7. **Raspberry Pi Deployment:** End-to-end verified sync over `https://raspberrypi.<tailscale_number>.ts.net` (local port 8090 via `tailscale serve`).
8. **Networking Guide:** `docs/networking.md` documenting the Tailscale setup with clearly marked (but unwritten-in-depth) migration paths to Tailscale Funnel / Cloudflare Tunnel.
9. **Tests:** Backend pytest suite (auth, LWW upsert, pull-since, tombstones) + frontend Vitest suite for the sync client and unsynced-entry queries.

---

## 2. Technology Stack & Directory Structure

- **Backend Runtime:** Python 3.14 + FastAPI + uvicorn (stdlib `sqlite3`, no ORM—keeps the image small and the SQL explicit)
- **Backend Testing:** pytest + httpx (`TestClient`)
- **Container:** Docker, multi-stage build, non-root user, `linux/amd64` + `linux/arm64`
- **Frontend:** unchanged from Sprint 1 (Vite + React 19 + TS + Dexie), plus the new `sync/` module and status indicator

### Repository Directory Structure (new/changed in Sprint 2)

```text
habit_tracker/
├── docker-compose.yml              # YAML-only deployment config (API_KEY, ports, CORS, volume)
├── .github/workflows/
│   ├── deploy.yml                  # (existing) frontend → GitHub Pages
│   └── publish-backend.yml         # (new) backend image → GHCR (multi-arch)
├── docs/
│   ├── networking.md               # (new) Tailscale guide + migration paths
│   └── self_hosting.md             # (new) docker compose deployment guide
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml              # deps: fastapi, uvicorn, pydantic; dev: pytest, httpx
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, routers, lifespan (schema init)
│   │   ├── config.py               # API_KEY, DB_PATH, CORS_ORIGINS from env (YAML-driven)
│   │   ├── auth.py                 # Bearer token dependency (constant-time compare)
│   │   ├── db.py                   # sqlite3 connection, CREATE TABLE IF NOT EXISTS, pragmas
│   │   ├── models.py               # Pydantic request/response models (mirrors client types)
│   │   └── sync.py                 # LWW upsert + pull-since logic (single transaction)
│   └── tests/
│       ├── test_auth.py            # 401 without/with wrong key, 200 with correct key
│       ├── test_sync_push.py       # LWW: newer wins, older ignored, inserts, tombstones
│       └── test_sync_pull.py       # incremental pull, last_synced_at=0 full pull, server_time
└── frontend/src/
    ├── App.tsx                     # + <SyncStatusIndicator/> in header (top right)
    ├── sync/
    │   ├── settings.ts             # get/set server URL + API key (localStorage)
    │   ├── syncClient.ts           # performSync(), forcePull(), forcePush(), healthCheck()
    │   ├── useSync.ts              # React hook: state machine + triggers + unsynced counts
    │   └── types.ts                # SyncRequest/SyncResponse wire types
    ├── components/sync/
    │   ├── SyncStatusIndicator.tsx # dot + spinner + click popover
    │   └── UnsyncedEntriesPopover.tsx
    ├── components/settings/
    │   └── SyncSettings.tsx        # Server URL, API Key, Sync Now, Force Pull/Push
    └── test/
        ├── syncClient.test.ts      # mocked fetch: push/pull/mark-synced behavior
        └── unsynced.test.ts        # synced=0 queries across all four tables
```

---

## 3. Backend API Specification

### 3.1 Configuration (YAML-only, no `.env`)

`docker-compose.yml` (repo root, shipped as the user-facing config):

```yaml
services:
  habit-sync-server:
    image: ghcr.io/yourusername/habit-sync-server:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8090:8080"     # loopback only; 8090 = existing tailscale serve target on the host
    environment:
      - API_KEY=change_this_to_a_strong_secret
      - CORS_ORIGINS=https://yourusername.github.io
      - DB_PATH=/app/data/habits.sqlite
    volumes:
      - ./data:/app/data
```

- `API_KEY` (**required** — server refuses to start without it), `CORS_ORIGINS` (comma-separated), `DB_PATH`.
- Port published as **`127.0.0.1:8090`** because the Pi's existing `tailscale serve` rule already forwards tailnet HTTPS to local port **8090**; the container itself listens on 8080 internally. Nothing is exposed on the LAN, and clients use `https://raspberrypi.<tailscale_number>.ts.net` **without a port** (Tailscale terminates TLS on 443 and forwards to 8090).

### 3.2 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | none | Liveness for the status indicator + popover. Returns `{"status":"ok","server_time":<ms>,"version":"<app version>"}`. Exposes no user data. |
| `POST` | `/api/v1/sync` | `Authorization: Bearer <API_KEY>` | The single batch sync endpoint. |

No separate version endpoint: the app version (read from package metadata at build time) rides along in the health response so the popover can display it.

Auth failures → `401 {"detail": "Invalid API key"}`. Comparison must be constant-time (`hmac.compare_digest`).

### 3.3 Sync Protocol (wire format)

Request:

```json
POST /api/v1/sync
{
  "last_synced_at": 1732224000000,
  "habits": [ ...local rows with synced==0... ],
  "habit_logs": [ ... ],
  "derived_metrics": [ ... ],
  "plot_views": [ ... ]
}
```

Response:

```json
{
  "server_time": 1732224001000,
  "habits": [ ...rows with updated_at > last_synced_at... ],
  "habit_logs": [ ... ],
  "derived_metrics": [ ... ],
  "plot_views": [ ... ]
}
```

Server processing (all inside **one** SQLite transaction):
1. Capture `server_time = now_ms()` **at transaction start** (so rows written concurrently are never lost between "pull" and "server_time").
2. Upsert each incoming row: insert if absent; otherwise update only if `incoming.updated_at > existing.updated_at` (Last-Write-Wins). Soft-deleted rows (`deleted = 1`) are upserted like any row—tombstones propagate.
3. Select all rows (including tombstones) with `updated_at > last_synced_at` per table.
4. Commit and respond.

Server-side schema: identical columns to the client tables **minus** the local-only `synced` flag. `id TEXT PRIMARY KEY`, `updated_at INTEGER`, `deleted INTEGER DEFAULT 0`, `UNIQUE(habit_id, date)` on `habit_logs` (with `ON CONFLICT` handling for upserts).

### 3.4 CORS
- Reflect allowed origins from `CORS_ORIGINS`; allow `Authorization` and `Content-Type` headers; `GET`/`POST`/`OPTIONS` methods.
- Needed because the frontend runs on GitHub Pages (or `localhost:5173` in dev—document adding it).

---

## 4. Sync Client (Frontend)

### 4.1 Settings Storage (`sync/settings.ts`)
- `serverUrl` and `apiKey` in `localStorage` (`habit_tracker.server_url`, `habit_tracker.api_key`), normalized (trailing `/` stripped).
- Empty `serverUrl` ⇒ sync disabled entirely (indicator shows "not configured").

### 4.2 Sync Engine (`sync/syncClient.ts`)
- `performSync()`:
  1. Collect rows with `synced == 0` from all four tables.
  2. `POST {serverUrl}/api/v1/sync` with `last_synced_at` (persisted in `localStorage`) and the rows.
  3. On `200`: upsert server rows into IndexedDB **only where incoming `updated_at` > local `updated_at`**; mark pushed rows `synced = 1` (re-check `updated_at`—if a newer local edit happened mid-flight, keep `synced = 0`); persist `server_time` as new `last_synced_at`.
  4. On network error/timeout/`401`: leave everything `synced = 0`, record `lastError` + timestamp for the indicator. Never lose local data on failure.
- `forcePull()` (Force Pull from Server): `last_synced_at = 0`, empty push arrays, apply LWW locally, mark applied rows `synced = 1`. (Does not delete local rows absent from the server—those remain local and will be pushed on the next sync; newer local edits are preserved.)
- `forcePush()` (Force Push to Server): set `synced = 0` on **all** rows (without touching `updated_at`), then `performSync()`.
- Single-flight guard: concurrent triggers coalesce into one in-flight request.

### 4.3 Automatic Triggers (`sync/useSync.ts`)
- On app mount; on `visibilitychange` → visible; on window `online`; debounced (~2 s) after local writes via Dexie's `db.hooks.on('writes')` across all four tables; manual *Sync Now*.
- Health poll: `GET /api/v1/health` every 30 s and on focus, with a 5 s abort timeout (only when a server URL is configured).

### 4.4 Settings UI (`components/settings/SyncSettings.tsx`)
Rendered in the Settings tab above the backup fieldset:
- Inputs: **Sync Server URL** (e.g. `https://raspberrypi.12345.ts.net`—no port; Tailscale serves HTTPS on 443), **API Key** (password input).
- Buttons: `Save`, `Sync Now`, `Force Pull from Server (overwrite local)`, `Force Push to Server`, each with `window.confirm` for the destructive ones.
- Live status line: connection state, last sync time, unsynced change count, last error.

---

## 5. Connection & Sync Status Indicator

**Component:** `components/sync/SyncStatusIndicator.tsx`, rendered in the `<header>` of `App.tsx`, floated to the **top-right corner**.

### States (dot + tooltip) — pulse only, no spinner (keep it simple)
| State | Visual | Condition |
|---|---|---|
| Not configured | ⚪ gray, dimmed | No server URL set |
| Connected | 🟢 **green dot** | Health check succeeded within the last poll cycle |
| Syncing / checking | 🟢 green dot **gently pulsing** | A sync or health request is in flight |
| Disconnected | 🟠 **orange dot** | Server configured but unreachable (offline, timeout, tailnet down); tooltip shows last check time |
| Error | 🔴 **red dot** | Auth rejected (`401`) or a sync/server failure (tooltip shows `lastError` and time) |

- A small numeric badge on the dot shows the number of unsynced local changes (hidden when 0).

### Click Popover (`UnsyncedEntriesPopover.tsx`)
Clicking the indicator opens a compact popover showing:
- **Server info:** host, connection state, last sync time, and the **server version** from the health response (shown when reachable).
- **Unsynced changes** (summary only—no per-entry detail):
  - `Habits (1): 🚶 Walking`
  - `Derived metrics (n): …` / `Plot views (n): …` — hidden when 0
  - `Entries (5): 🍺 Beer 3 · 🏃 Running 2` (per-habit counts)
- A `Sync Now` button; a hint linking to *Settings* when not configured.
- Data source: `useLiveQuery` over `where('synced').equals(0)` on all four tables, so the popover updates live as edits happen; the version comes from the last health check.

---

## 6. Deployment & CI/CD

### 6.1 Backend Dockerfile
- Multi-stage: builder installs pinned deps → runtime stage copies site-packages + `app/`.
- Runs as non-root user; `VOLUME /app/data`; `HEALTHCHECK CMD curl -f http://localhost:8080/api/v1/health`.
- Default: `uvicorn app.main:app --host 0.0.0.0 --port 8080`.

### 6.2 GitHub Actions: `.github/workflows/publish-backend.yml`
- Triggers: push to `main` affecting `backend/**` or the workflow file, plus `workflow_dispatch` and version tags.
- Steps: checkout → `docker/setup-qemu-action` → `docker/setup-buildx-action` → `docker/login-action` (GHCR, `GITHUB_TOKEN`) → `docker/metadata-action` (tags: `latest`, short SHA, semver on tags) → `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`.
- Image: `ghcr.io/<owner>/<repo>:latest`.
- Frontend Pages workflow ([deploy.yml](../.github/workflows/deploy.yml)) is already in place—no changes needed.

### 6.3 Raspberry Pi Deployment (Tailscale — current setup)

Preconditions (already true on the target Pi): Docker installed, Tailscale running, `tailscale serve` configured for **local port 8090**.

1. On the Pi, fetch `docker-compose.yml`, set `API_KEY` and `CORS_ORIGINS` (GitHub Pages URL).
2. `docker compose pull && docker compose up -d`
3. Verify locally on the Pi: `curl http://127.0.0.1:8090/api/v1/health` → `{"status":"ok","server_time":...,"version":"..."}` (8090 = the published host port).
4. Verify via Tailscale: `curl https://raspberrypi.<tailscale_number>.ts.net/api/v1/health` — TLS on port 443 is terminated by Tailscale and forwarded to local port 8090. If this fails, run `tailscale serve status` and confirm the serve target is local port **8090** (exactly what `docker-compose.yml` publishes).
5. In the app: Settings → Server URL `https://raspberrypi.<tailscale_number>.ts.net` (no port), API Key → Save → Sync Now → green dot.
6. Second device: join the same tailnet (Tailscale app), enter the same URL/key, Force Pull → verify identical data.

**Client requirement:** every syncing device must be connected to the tailnet. This is the accepted trade-off for this sprint (private, no port forwarding, valid HTTPS ⇒ no Mixed Content issues with GitHub Pages).

### 6.4 Networking Guide (`docs/networking.md`) — must stay open-ended
Structure the guide as **one current option + two documented migration paths**:

1. **Option A (current): Tailscale serve** — tailnet-only HTTPS: Tailscale terminates TLS on the `.ts.net` name and forwards to local port 8090; step-by-step Pi setup, client onboarding, troubleshooting (`tailscale serve status`, clock skew, key errors).
2. **Option B (future): Tailscale Funnel** — same serve config plus `--funnel` to expose the same URL publicly over HTTPS; no app changes, only the Server URL clients use.
3. **Option C (future): Cloudflare Tunnel** — `cloudflared` tunnel to a public hostname; no app changes, only the Server URL.

Explicitly state: *the application is tunnel-agnostic; switching providers never requires a database migration or code change—only the Sync Server URL in Settings.*

---

## 7. Testing & Verification Strategy

### Backend (pytest)
- `test_auth.py`: no key → 401; wrong key → 401; correct key → 200; health endpoint open.
- `test_sync_push.py`: insert new rows; LWW (newer `updated_at` overwrites, older is ignored); tombstones propagate; `UNIQUE(habit_id, date)` upsert behaves.
- `test_sync_pull.py`: only rows `> last_synced_at` returned; `last_synced_at = 0` returns everything including tombstones; `server_time` monotonic.

### Frontend (Vitest + fake-indexeddb, mocked `fetch`)
- `syncClient.test.ts`: successful sync marks pushed rows `synced = 1` and stores `server_time`; server rows applied only when newer; failed sync leaves `synced = 0`; a local edit made *during* an in-flight sync stays `synced = 0`.
- `unsynced.test.ts`: `synced = 0` queries return exactly the edited/deleted rows across all four tables; counts used by the badge/popover are correct.

### Manual Verification Checklist
1. **Health:** `curl` the health endpoint on the Pi (`127.0.0.1:8090` and the `.ts.net` URL).
2. **Auth:** wrong API key in Settings → red dot with 401 message; correct key → green dot.
3. **Round trip:** log entries on device A → Sync Now → device B Force Pull → data appears; badge on A returns to 0.
4. **Offline:** disable Wi-Fi → red dot, edits accumulate (badge grows) → reconnect → auto-sync clears badge.
5. **Popover:** with pending edits, click the dot → server host/version/last-sync shown, unsynced summary lists habits/metrics/plots and per-habit entry counts; `Sync Now` inside the popover works.
6. **Force Push:** wipe server DB (delete `./data/*.sqlite`, restart) → Force Push on device A → device B Force Pull → identical state.
7. **CI:** push to `main` → GHCR image published for `amd64` **and** `arm64` → `docker compose pull` on the Pi updates the container without data loss (volume persists).

---

## 8. Acceptance Criteria

- [ ] `POST /api/v1/sync` implements LWW batch sync for all four tables with Bearer auth and CORS; covered by pytest.
- [ ] `docker compose up -d` from a bare checkout (YAML edits only) yields a running server with persistent SQLite.
- [ ] Multi-arch image (`amd64` + `arm64`) published to GHCR by GitHub Actions.
- [ ] Frontend syncs automatically (open/focus/online/debounced edits) and manually; Force Pull / Force Push work per spec §5.6.
- [ ] Header dot: green connected, pulsing while syncing, orange disconnected, red on error, with an unsynced-count badge.
- [ ] Clicking the dot reveals server info (host, version, last sync), the unsynced summary (habits/metrics/plots + per-habit entry counts), and a Sync Now action.
- [ ] End-to-end sync verified between two devices over `https://raspberrypi.<tailscale_number>.ts.net`.
- [ ] `docs/networking.md` documents Tailscale serve as the current path and leaves Tailscale Funnel / Cloudflare Tunnel as documented alternatives.
