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
Habits can be marked as positive (`is_good: true`) or negative (`is_good: false`), and support `binary` (boolean), `integer`, and `float` values.
The UI renders input controls dynamically based on a `widget_type` and `config_json` stored per habit:
1. **Binary Toggle (`toggle`):** Simple done/not-done checkmark (`0` or `1`).
2. **Counter (`counter`):** Integer stepper (`+1` / `-1`).
3. **Numeric Input (`numeric`):** Direct decimal/integer entry (e.g., kilometers cycled, hours slept).
4. **Preset Accumulator (`preset_accumulator`):** Configurable quick-tap buttons that add predefined float/int values to the day's cumulative total, plus an optional custom value entry.
   - *Example (Alcohol tracking):* Tapping "Beer 3.3dl" adds `1.0`, "Beer 5.0dl" adds `1.5`, "Wine Glass" adds `1.0` to a unified `alcohol_units` habit log.
5. **Derived Metric (`derived`):** Virtual/calculated metric with no manual input widget, evaluated client-side from other habits via a formula.

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
- Include a manual JSON Export/Import fallback for backing up or migrating profiles without a sync server.

---

## 3. System Architecture

    [ Client: Browser / PWA (Hosted on GitHub Pages) ]
       ├── UI + Formula, Target Scaling & Charting Engine
       ├── Local DB: IndexedDB (e.g., Dexie.js) for instant offline reads/writes
       └── Settings: Sync Server URL & API Key
               │
               │  HTTPS (REST + CORS + Bearer Token)
               │  (e.g., via Cloudflare Tunnel to bypass Mixed Content & Tailscale)
               ▼
    [ Backend: Dockerized Sync Server (e.g., Raspberry Pi) ]
       ├── Lightweight REST API (FastAPI / Node.js / Go)
       ├── Auth: Bearer Token check against API_KEY configured in docker-compose.yml
       └── Persistent DB: SQLite (bind-mounted via Docker volume)

### Key Architectural Decisions
1. **Frontend (GitHub Pages):** Static PWA bundle (React/Svelte/Vue + Service Worker) using IndexedDB (e.g., Dexie.js) as the primary local store.
2. **Backend (Raspberry Pi / Self-Hosted):** Minimal REST server with CORS enabled (to accept requests from GitHub Pages origins) and SQLite for zero-maintenance persistence.
3. **HTTPS & Networking:** Because GitHub Pages is served over HTTPS, browsers block plain HTTP requests (Mixed Content). The backend sits behind an HTTPS endpoint—typically **Cloudflare Tunnel (`cloudflared`)** on the Raspberry Pi—providing worldwide HTTPS access without router port forwarding or requiring VPN clients (like Tailscale) on client devices.

---

## 4. Database Schema (Mirrored in SQLite & IndexedDB)

All synced tables use client-generated UUIDs, millisecond timestamps (`updated_at`) for conflict resolution, and **Soft Deletes / Tombstones** (`deleted = 1`) so deletions propagate across devices without resurrecting.

### `habits`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `data_type` (TEXT: `'binary' | 'integer' | 'float'`)
- `unit` (TEXT)
- `is_good` (INTEGER DEFAULT 1)
- `widget_type` (TEXT: `'toggle' | 'counter' | 'numeric' | 'preset_accumulator' | 'derived'`)
- `config_json` (TEXT — JSON storing widget presets, derived `formula` & `dependencies`, optional `target` `{ value, period, operator }`, color/icon)
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

### `plot_views`
- `id` (TEXT PRIMARY KEY)
- `title` (TEXT NOT NULL)
- `config_json` (TEXT — JSON storing chart type, array of metric/habit IDs, aggregation bucket, date range, show_targets flag)
- `sort_order` (INTEGER DEFAULT 0)
- `updated_at` (INTEGER — Unix epoch ms)
- `deleted` (INTEGER DEFAULT 0)

*(Client IndexedDB records additionally maintain a local-only `synced` boolean flag to track unpushed offline changes.)*

---

## 5. Sync Protocol (Last-Write-Wins Batch Sync)

Communication uses a single sync endpoint: `POST /api/v1/sync` (protected by `Authorization: Bearer <API_KEY>`).

1. **Trigger:** Sync runs automatically on app open / focus (`visibilitychange`), debounced after local edits, or manually via a "Sync Now" button.
2. **Client Request:** Sends `last_synced_at` (timestamp) plus arrays of all local records (`habits`, `habit_logs`, `plot_views`) where `synced == false`.
3. **Server Processing (within a SQLite transaction):**
   - Upserts incoming records only if `incoming.updated_at > existing.updated_at` (Last-Write-Wins).
   - Queries all records across all three tables where `updated_at > last_synced_at`.
4. **Server Response:** Returns `server_time` (current epoch ms) and the arrays of updated records from the server.
5. **Client Commit:** Upserts received server records into IndexedDB (where newer), marks pushed records `synced = true`, and updates `last_synced_at = server_time`.
6. **Manual Recovery / Full Resync (Settings):**
   - **Force Pull from Server (Overwrite Local):** Clears local IndexedDB and pulls the full database from the server (`last_synced_at = 0`, no push). Handles manual SQL edits, bulk CSV imports, or hard deletes performed directly on the Pi.
   - **Force Push to Server:** Marks all local records `synced = false` and pushes the full client database to the server (e.g., if rebuilding an empty server).

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
- **Self-Hosting Guide (`docs/self-hosting.md` or README section):** Step-by-step instructions for deploying on a Raspberry Pi or Linux host using `docker-compose.yml` (covering Docker installation, setting `API_KEY`, updating containers with `docker compose pull`, and backing up `./data/habits.sqlite`).
- **HTTPS / Networking Guide:** Step-by-step walkthrough for exposing the local Raspberry Pi API over HTTPS using Cloudflare Tunnel (`cloudflared`) so GitHub Pages Mixed Content rules are satisfied without VPN apps.
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
- Deploy on Raspberry Pi with Cloudflare Tunnel (`cloudflared`) and verify end-to-end multi-device syncing.

### Sprint 3: Derived Metrics, Targets & Multi-Metric Plots
- Implement `widget_type: 'derived'` with safe formula parser (`expr-eval` or `mathjs`) and date alignment.
- Add target configuration (`value`, `period`, `operator`) to habit/derived-metric UI forms.
- Integrate a charting library (e.g., Chart.js) and build the `plot_views` CRUD builder:
  - Plot multiple metrics/derived metrics on one chart (with dual-axis option).
  - Support time aggregations (`daily`, `weekly`, `monthly`, `rolling_7d_sum`, `rolling_7d_avg`).
  - Render time-scaled target reference lines and calculate native-period completion rates.

### Sprint 4: PWA Polish, UI/UX & Full Documentation
- Add PWA `manifest.json` and Service Worker caching for 100% offline launch.
- Apply clean, responsive mobile-first CSS/styling, dark mode, icons, and fast tap ergonomics.
- Add first-visit onboarding flow ("Connect Server", "Start Empty", or "Load Demo Starter Pack").
- Write complete documentation (`README.md`, Self-Hosting & Cloudflare Tunnel guide, User Guide, Developer Guide) and finalize the open-source license.
