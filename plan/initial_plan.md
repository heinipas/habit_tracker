# Project Specification: Local-First, Self-Hosted Habit Tracker

## 1. Project Overview & Goals
Build an open-source, privacy-preserving, local-first habit tracking Progressive Web App (PWA) with an optional self-hosted sync backend.
- **Public & Reusable:** The entire codebase lives in a public GitHub repository with zero hardcoded personal habits, secrets, or user data. Anyone can use the hosted frontend directly and optionally spin up their own backend.
- **Zero-Latency & Offline-First:** All reads and writes occur instantaneously against the browser's local database. Syncing happens asynchronously in the background.
- **Data-Driven Configuration:** Habit definitions, custom input pickers, derived formulas, targets, and custom dashboard plot configurations are stored as user data in the database—not in application code—so they sync seamlessly across devices.
- **Configuration Style:** Prefer YAML (`docker-compose.yml` and YAML config files) over `.env` files for server and deployment configuration.
- **Documentation Priority:** High-quality, beginner-friendly documentation is a first-class requirement.


---

## 2. Functional Requirements

### A. Habit Types & Input Widgets
Habits can be marked as positive (`is_good: true`) or negative (`is_good: false`), and support `binary` (boolean) and `float` (numeric) values.
Each habit defines:
- **`default_value` (`number | null`):** Controls how unlogged days are treated in statistics and plots. `null` means unlogged days are ignored/missing (e.g. body weight, sleep hours). A fixed number (e.g. `0`) means unlogged days count as that value (e.g. `0` alcohol units, `0` km cycled).
- **`default_picker_value` (`number | null` in `config_json`):** Default value for the daily logging UI tailored to the widget type (checkbox state for toggle; numeric value for numeric, counter, and pre-filling the custom delta field for preset accumulator).

The UI renders input controls dynamically based on a `widget_type` (`'toggle' | 'counter' | 'numeric' | 'preset_accumulator'`) and `config_json` stored per habit:
1. **Binary Toggle (`toggle`):** Simple done/not-done checkmark (`0` or `1`).
2. **Counter (`counter`):** Stepper (`+{step}` / `-{step}`).
3. **Numeric Input (`numeric`):** Direct numeric entry (e.g., kilometers cycled, hours slept).
4. **Preset Accumulator (`preset_accumulator`):** Configurable quick-tap buttons that add predefined values to the day's cumulative total, plus a custom delta entry field and direct total correction.
   - *Example (Alcohol tracking):* Tapping "Beer 3.3dl" adds `1.0`, "Beer 5.0dl" adds `1.5`, "Wine Glass" adds `1.0` to a unified `alcohol_units` habit log.

*(Virtual/calculated metrics evaluated from other habits via formula are handled separately in a dedicated `derived_metrics` table, not as habit input widgets.)*

### B. Targets, Derived Metrics & Custom Plot Views
- **Derived / Formula Metrics:** Evaluated client-side using a safe math expression parser (e.g., `expr-eval` or `mathjs`) referencing existing habit IDs aligned by date.
  - *Examples:* Average speed `bike_km / (sport_mins / 60)`, or combined totals `habit_a + habit_b`.
- **Targets (Optional per Habit or Derived Metric):**
  - Stored in `habits.config_json` as `{ value, period: 'daily' | 'weekly' | 'monthly', operator: 'gte' | 'lte' }`.
  - **Scaling in Plots:** When a plot aggregates data into a different time unit than the target's native period, the target reference line scales proportionally (e.g., a weekly limit of `< 3` scales to `< 3/7` on a daily view, `3` on a weekly sum or 7-day rolling sum view, and `3 * days / 7` on a monthly view).
  - **Completion Rate:** Displayed in plot summaries/stats, calculated against the target's native cadence (e.g., percentage of full weeks meeting `<= 3` units) as well as overall total vs. scaled target for the selected date range.
- **Customizable Plot Views:** Users can create, edit, and delete dashboard chart configurations via the UI:
  - Supports **multiple metrics plotted on the same chart** (including dual-axis support for metrics with different units).
  - Configurable chart type (line, bar, scatter), aggregation bucket (`daily`, `weekly`, `monthly`, `rolling_7d_sum`, `rolling_7d_avg`), date range, and toggleable scaled target reference lines.
  - Persisted in the database so dashboards remain identical across devices.

### C. Device Setup & Portability
- New devices start clean and only require entering two fields in the Settings UI: **Sync Server URL** and **API Key** (stored locally in `localStorage`/IndexedDB).
- Once configured, the client pulls all habit definitions, logs, and plot views on the first sync.
- **Connection Status Indicator:** The header shows a status dot (green = connected, gently pulsing = sync in progress, orange = disconnected/unreachable, red = error) with an unsynced-changes count badge; clicking it opens a popover with server info (host, version, last sync) and a summary of unsynced entries, offering a manual *Sync Now*.
- Include a manual JSON Export/Import fallback for backing up or migrating profiles without a sync server.

---

## 3. System Architecture

    [ Client: Browser / PWA (Hosted on GitHub Pages) ]
       ├── UI + Formula, Target Scaling & Charting Engine
       ├── Local DB: IndexedDB (e.g., Dexie.js) for instant offline reads/writes
       └── Settings: Sync Server URL & API Key
               │
               │  HTTPS (REST + CORS + Bearer Token)
               │  (currently via Tailscale serve — tailnet-only;
               │   swappable later to Tailscale Funnel or Cloudflare Tunnel)
               ▼
    [ Backend: Dockerized Sync Server (e.g., Raspberry Pi) ]
       ├── Lightweight REST API (FastAPI / Node.js / Go)
       ├── Auth: Bearer Token check against API_KEY configured in docker-compose.yml
       └── Persistent DB: SQLite (bind-mounted via Docker volume)

### Key Architectural Decisions
1. **Frontend (GitHub Pages):** Static PWA bundle (React/Svelte/Vue + Service Worker) using IndexedDB (e.g., Dexie.js) as the primary local store.
2. **Backend (Raspberry Pi / Self-Hosted):** Minimal REST server with CORS enabled (to accept requests from GitHub Pages origins) and SQLite for zero-maintenance persistence.
3. **HTTPS & Networking:** Because GitHub Pages is served over HTTPS, browsers block plain HTTP requests (Mixed Content), so the backend must be reached over HTTPS. **Current choice: Tailscale VPN on the Raspberry Pi**—`tailscale serve` terminates HTTPS for `https://raspberrypi.<tailscale_number>.ts.net` (local port 8090) and forwards to the Dockerized server on `127.0.0.1:8080`. This requires no router port forwarding and keeps the API private to the tailnet (client devices must run the Tailscale app). The setup is deliberately **tunnel-agnostic**: switching later to **Tailscale Funnel** or **Cloudflare Tunnel** (public HTTPS without VPN clients) requires no application or database changes—only the *Sync Server URL* entered in Settings.

---

## 4. Database Schema (Mirrored in SQLite & IndexedDB)

All synced tables use client-generated UUIDs, millisecond timestamps (`updated_at`) for conflict resolution, and **Soft Deletes / Tombstones** (`deleted = 1`) so deletions propagate across devices without resurrecting.

### `habits`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `emoji` (TEXT — optional single emoji symbol to visually identify the habit in UI, placed before title)
- `data_type` (TEXT: `'binary' | 'float'`)
- `unit` (TEXT)
- `is_good` (INTEGER DEFAULT 1)
- `default_value` (REAL — `NULL` for missing/unrecorded stats, or number like `0` for fixed baseline)
- `widget_type` (TEXT: `'toggle' | 'counter' | 'numeric' | 'preset_accumulator'`)
- `config_json` (TEXT — JSON storing widget presets, optional `default_picker_value`, optional `target` `{ value, period, operator }`, color/icon)
- `updated_at` (INTEGER — Unix epoch ms)
- `deleted` (INTEGER DEFAULT 0)

### `habit_logs`
- `id` (TEXT PRIMARY KEY)
- `habit_id` (TEXT REFERENCES habits(id))
- `date` (TEXT NOT NULL — `YYYY-MM-DD`)
- `value` (REAL NOT NULL)
- `updated_at` (INTEGER — Unix epoch ms)
- `deleted` (INTEGER DEFAULT 0)
- *Constraint:* `UNIQUE(habit_id, date)` (or handle latest entry per habit/date)

### `derived_metrics`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `emoji` (TEXT — optional emoji symbol to visually identify the derived metric, placed before title)
- `unit` (TEXT)
- `is_good` (INTEGER DEFAULT 1)
- `formula` (TEXT NOT NULL)
- `config_json` (TEXT — JSON storing optional `target`, color/chart preferences, etc.)
- `updated_at` (INTEGER — Unix epoch ms)
- `deleted` (INTEGER DEFAULT 0)

### `plot_views`
- `id` (TEXT PRIMARY KEY)
- `title` (TEXT NOT NULL)
- `emoji` (TEXT — optional emoji symbol to visually identify the plot view, placed before title)
- `config_json` (TEXT — JSON storing chart type, array of metric/habit IDs, aggregation bucket, date range, show_targets flag)
- `sort_order` (INTEGER DEFAULT 0)
- `updated_at` (INTEGER — Unix epoch ms)
- `deleted` (INTEGER DEFAULT 0)

*(Emojis: An optional `emoji` field is supported across `habits`, `presets` (in `config_json`), `derived_metrics`, and `plot_views`. In the UI, the emoji is consistently rendered before the title/name, e.g. `🏃 Running`, `🍺 Beer 5dl`, `📊 Habit Correlation`.)*

*(Client IndexedDB records additionally maintain a local-only `synced` INTEGER flag (`0` for unsynced, `1` for synced) so unpushed offline changes can be reliably indexed and queried.)*

---

## 5. Sync Protocol (Last-Write-Wins Batch Sync)

Communication uses a single sync endpoint: `POST /api/v1/sync` (protected by `Authorization: Bearer <API_KEY>`).

1. **Trigger:** Sync runs automatically on app open / focus (`visibilitychange`), debounced after local edits, manually via a "Sync Now" button, and on a 30 s background health poll while a server is configured (the poll's successful probe also performs a sync, so pending changes never sit unsynced against a healthy server).
2. **Client Request:** Sends `last_synced_at` (timestamp) plus arrays of all local records (`habits`, `habit_logs`, `derived_metrics`, `plot_views`) where `synced == 0`.
3. **Server Processing (within a SQLite transaction):**
   - Upserts incoming records only if `incoming.updated_at > existing.updated_at` (Last-Write-Wins).
   - Queries all records across all four tables where `updated_at > last_synced_at`.
4. **Server Response:** Returns `server_time` (current epoch ms) and the arrays of updated records from the server.
5. **Client Commit:** Upserts received server records into IndexedDB (where newer), marks pushed records `synced = 1`, and updates `last_synced_at = server_time`.
6. **Manual Recovery / Full Resync (Settings):**
   - **Force Pull from Server (Overwrite Local):** Pulls the full database from the server (`last_synced_at = 0`, no push) and applies it with Last-Write-Wins: newer server rows overwrite older local rows, while local rows newer than the server (or unknown to it) are kept and pushed on the next sync. Handles manual SQL edits, bulk CSV imports, or hard deletes performed directly on the Pi.
   - **Force Push to Server:** Marks all local records `synced = 0` and pushes the full client database to the server (e.g., if rebuilding an empty server).

*(UI queries always filter `WHERE deleted = 0`.)*

---

## 6. Deployment & Reusability Strategy

- **Frontend CI/CD:** GitHub Actions automatically builds and deploys the static PWA to GitHub Pages.
- **Backend CI/CD:** GitHub Actions builds a multi-arch Docker image (supporting ARM64/ARMv7 for Raspberry Pi and AMD64) and publishes it to GitHub Container Registry (`ghcr.io/<user>/<repo>`).
- **End-User Self-Hosting (YAML-only, no `.env` required):** Anyone can deploy their own sync server without cloning source code or installing runtime dependencies by downloading `docker-compose.yml`, editing `API_KEY` (and optionally the host port or volume path) directly in YAML, and running `docker compose up -d`.

Example `docker-compose.yml`:

    services:
      habit-sync-server:
        image: ghcr.io/yourusername/habit-sync-server:latest
        restart: unless-stopped
        ports:
          - "8080:8080"
        environment:
          - API_KEY=change_this_to_a_strong_secret
        volumes:
          - ./data:/app/data

---

## 7. Documentation Requirements

Thorough, well-structured documentation is mandatory across the repository:
- **Main `README.md`:** Clear project overview, feature highlights, screenshots/examples (including preset accumulator, targets, and derived multi-metric plots), and architecture diagram.
- **Self-Hosting Guide (`docs/self_hosting.md` or README section):** Step-by-step instructions for deploying on a Raspberry Pi or Linux host using `docker-compose.yml` (covering Docker installation, setting `API_KEY`, updating containers with `docker compose pull`, and backing up `./data/habits.sqlite`).
- **HTTPS / Networking Guide (`docs/networking.md`):** Provider-agnostic guide with the current path documented in full—exposing the local Raspberry Pi API over HTTPS via **Tailscale serve**—plus clearly marked migration sections (outline-level) for switching to **Tailscale Funnel** or **Cloudflare Tunnel** later. The app itself never changes when switching providers.
- **User Guide:** How to configure habits, preset accumulators, derived formula syntax, targets & scaling, custom plot views, and multi-device setup/resync via Settings.
- **Developer / Contributing Guide:** Local dev setup (running frontend + backend locally), API contract specification, and instructions for adding new modular input widgets.

---

## 8. Incremental Implementation Plan (Sprints)

Build incrementally—starting with a functional, barebones unstyled HTML/JS core before adding visual polish and advanced analytics:

### Sprint 1: Barebones Local MVP (Unstyled HTML / Core Data)
- Scaffold frontend project (with minimal/plain HTML—no styling effort yet) + IndexedDB (Dexie.js).
- Implement CRUD forms for `habits` (`toggle`, `counter`, `numeric`, `preset_accumulator`) and `habit_logs` with soft deletes (`deleted = 1`).
- Render a basic daily logger view (buttons/inputs per habit) and a plain HTML table showing recent entries.
- Add manual JSON Export/Import in Settings so data is already safe and portable.

### Sprint 2: Sync Server, Docker & GitHub Pages Deployment
- Build the backend REST API + SQLite schema (`POST /api/v1/sync`, auth Bearer check, CORS).
- Add `Dockerfile`, `docker-compose.yml` (YAML-based config), and GitHub Actions workflow to publish multi-arch images to GHCR and deploy frontend to GitHub Pages.
- Implement Sync client in frontend: Settings UI (`Server URL`, `API Key`, `Sync Now`, `Force Pull`, `Force Push`) and automatic background sync triggers.
- Add a **connection/sync status indicator** in the top-right header: green dot when connected, gently pulsing while a sync is in progress, orange when disconnected, red on error, plus an unsynced-changes count badge; clicking it opens a popover with server info (host, version, last sync) and a summary of unsynced habits/metrics/plots and per-habit entry counts, with a manual *Sync Now* action.
- Deploy on Raspberry Pi over **Tailscale serve** (`https://raspberrypi.<tailscale_number>.ts.net`, local port 8090) and verify end-to-end multi-device syncing; document the setup in `docs/networking.md` with Tailscale Funnel / Cloudflare Tunnel left as alternative paths.

### Sprint 3: Derived Metrics, Targets & Multi-Metric Plots
- Implement `derived_metrics` table calculation engine with safe formula parser (`expr-eval` or `mathjs`) and date alignment.
- Add target configuration (`value`, `period`, `operator`) to habit/derived-metric UI forms.
- Integrate a charting library (e.g., Chart.js) and build the `plot_views` CRUD builder:
  - Plot multiple metrics/derived metrics on one chart (with dual-axis option).
  - Support time aggregations (`daily`, `weekly`, `monthly`, `rolling_7d_sum`, `rolling_7d_avg`).
  - Render time-scaled target reference lines and calculate native-period completion rates.

### Sprint 4: PWA Polish, UI/UX & Full Documentation
- Add PWA `manifest.json` and Service Worker caching for 100% offline launch.
- Apply clean, responsive mobile-first CSS/styling, dark mode, icons, and fast tap ergonomics.
- Add first-visit onboarding flow ("Connect Server", "Start Empty", or "Load Demo Starter Pack").
- Write complete documentation (`README.md`, Self-Hosting guide, Networking guide — Tailscale with Funnel/Cloudflare alternatives, User Guide, Developer Guide) and finalize the open-source license.

### Feature Backlog
- min, max
- Habit & derived-metric color: optional `color` in `config_json` (hex string) for habits and derived metrics — no schema/version change required; shown as the fieldset border color in the Daily Tracker only.
