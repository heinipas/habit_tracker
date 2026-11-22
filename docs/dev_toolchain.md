# Developer Toolchain & Local Development Guide

This document outlines the development prerequisites, toolchain installation, architectural standards, and testing procedures for the **Habit Tracker** project.

---

## 1. Prerequisites & Toolchain Setup

### System Requirements
- **Node.js:** v20.0.0 or later (v26.x supported and tested).
- **npm:** v10.0.0 or later.
- **Git:** Standard Git toolchain.

### Verifying Installation
Check your installed versions via terminal:
```bash
node -v
npm -v
git --version
```

If Node.js is not yet installed on your system:
- **macOS (via Homebrew):**
  ```bash
  brew install node
  ```
- **Linux (Ubuntu / Debian via NodeSource):**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Windows:** Download and install the latest LTS release from [nodejs.org](https://nodejs.org/).

### Recommended Editor Setup (VSCode)
Recommended extensions:
- **TypeScript and JavaScript Language Features** (built-in)
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier - Code formatter** (`esbenp.prettier-vscode`)

---

## 2. Project Architecture & Structure

The repository is structured to cleanly decouple the client-side frontend from upcoming self-hosted services:

```text
habit_tracker/
├── .gitignore
├── LICENSE
├── README.md
├── docs/                           # Project guides and documentation
│   └── dev_toolchain.md            # This toolchain reference
├── plan/                           # Sprint definitions and architecture specs
│   ├── initial_plan.md
│   └── sprint_01.md
└── frontend/                       # Client PWA application (Sprint 1)
    ├── index.html                  # Single page entry HTML
    ├── package.json                # Dependencies and npm run scripts
    ├── tsconfig.json               # TypeScript configuration
    ├── vite.config.ts              # Vite bundler configuration
    ├── src/
    │   ├── main.tsx                # React DOM root mounting
    │   ├── App.tsx                 # Core tab navigation & routing
    │   ├── types/                  # TypeScript data contracts & schemas
    │   │   ├── habit.ts            # Habit, DataType, WidgetType, Config
    │   │   ├── log.ts              # HabitLog
    │   │   ├── derived.ts          # DerivedMetric
    │   │   ├── plot.ts             # PlotView
    │   │   └── export.ts           # Backup JSON schema
    │   ├── db/                     # IndexedDB / Dexie.js persistence layer
    │   │   ├── db.ts               # Dexie database class & table definitions
    │   │   └── queries.ts          # Reactive CRUD, soft deletes, import/export
    │   ├── components/             # Unstyled semantic HTML UI components
    │   │   ├── common/             # DatePicker, reusable UI
    │   │   ├── tracker/            # Daily tracker view & dynamic widgets
    │   │   │   ├── DailyTracker.tsx
    │   │   │   └── widgets/
    │   │   │       ├── ToggleWidget.tsx
    │   │   │       ├── CounterWidget.tsx
    │   │   │       └── PresetAccumulatorWidget.tsx
    │   │   ├── habits/             # Habit configuration & CRUD
    │   │   │   ├── HabitList.tsx
    │   │   │   ├── HabitForm.tsx
    │   │   │   └── PresetConfigBuilder.tsx
    │   │   ├── history/            # Tabular logs review & inline editing
    │   │   │   └── RecentLogsTable.tsx
    │   │   └── settings/           # Backup export, import & reset
    │   │       └── BackupExportImport.tsx
    │   └── test/                   # Vitest automated test suite
    │       ├── setup.ts            # fake-indexeddb environment bootstrap
    │       ├── db.test.ts          # Database CRUD, soft-deletes & indexing tests
    │       ├── accumulator.test.ts # Preset calculations & value correction tests
    │       └── backup.test.ts      # JSON export/import & restore tests
```

---

## 3. Local Development Workflow

All frontend commands should be executed inside the `frontend/` directory:

```bash
cd frontend
```

### Install Dependencies
```bash
npm install
```

### Start Development Server
Starts a local Vite dev server with hot module replacement (HMR) at `http://localhost:3000`:
```bash
npm run dev
```

### Run Automated Tests
Runs unit and integration tests using **Vitest** in headless Node.js with `fake-indexeddb`:
```bash
npm test
```

### Type Checking & Production Build
Compiles TypeScript types and builds the optimized static bundle into `frontend/dist/`:
```bash
npm run build
```

### Preview Production Build
Previews the production assets generated in `frontend/dist/`:
```bash
npm run preview
```

---

## 4. Key Architectural Patterns & Decisions

### 1. Zero-Latency Local-First Persistence
- All reads and writes occur directly against browser **IndexedDB** using **Dexie.js**.
- UI reactivity is handled via Dexie's `useLiveQuery` hook—any background write automatically re-renders affected UI components without manual state synchronization.

### 2. Reliable Indexing with Numeric `synced` Flags (`0 | 1`)
- To reliably query unsynced local records across all browsers and engines, the `synced` field is stored as an integer (`0` for unpushed/modified offline changes, `1` for synced).
- Dexie schema indexes:
  ```typescript
  habits: 'id, name, widget_type, updated_at, deleted, synced',
  habit_logs: 'id, habit_id, date, [habit_id+date], updated_at, deleted, synced',
  derived_metrics: 'id, name, updated_at, deleted, synced',
  plot_views: 'id, sort_order, updated_at, deleted, synced'
  ```

### 3. Statistical Defaults vs. UI Picker Defaults
Habits separate statistical aggregation behavior from daily logging convenience:
- **`default_value` (`number | null`):**
  - `null`: Unlogged days are treated as missing/ignored in averages and charts (e.g. body weight, sleep hours).
  - Fixed number (e.g. `0`): Unlogged days count as that number (e.g. `0` alcohol units, `0` km biked).
- **`default_picker_value` (`number | null` in `config_json`):**
  - Tailored to the widget type on unlogged days: pre-populates the counter input; pre-fills the custom delta field for preset accumulators. Binary toggles have no picker default.

### 4. Direct Value Correction
- The `preset_accumulator` widget enables quick increment logging (e.g. tapping beverage presets), but also features a direct `[Correct / Edit Total]` toggle.
- This ensures users can fix mistaken double-taps or manually adjust daily cumulative totals directly from both the Tracker and the History table.

### 5. Soft Deletes & Tombstones
- Synced entities use soft deletion (`deleted = 1` and updated `updated_at`).
- All active queries filter `deleted === 0`.
- This prevents deleted records on one client from being resurrected by other devices during sync.

---

## 5. Data Backup & Portability

The app includes offline JSON backup export and import:
- **Format:** Versioned JSON containing arrays of `habits`, `habit_logs`, `derived_metrics`, and `plot_views`.
- **Merge Mode:** Uses Last-Write-Wins comparison based on `updated_at`.
- **Replace Mode:** Wipes local tables and restores fresh from the backup file.
