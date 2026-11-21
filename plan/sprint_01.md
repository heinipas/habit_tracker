# Sprint 1 Specification: Barebones Local MVP (Unstyled HTML / Core Data)

## 1. Overview & Objectives

The goal of **Sprint 1** is to build the core data engine and a fully functional, zero-latency, local-first Minimum Viable Product (MVP) running entirely in the browser using **IndexedDB (Dexie.js)**. 

Per the project specification in [initial_plan.md](file:///Users/pascalheiniger/Documents/GitHub/habit_tracker/plan/initial_plan.md), Sprint 1 adheres to a **strictly unstyled HTML** approach (semantic markup: `<fieldset>`, `<input>`, `<button>`, `<table>`) to ensure all focus remains on solid architecture, reactivity, generic schema modeling, and zero-latency local persistence before visual styling is introduced in later sprints.

### Core Deliverables
1. **Frontend Architecture & Scaffolding:** Vite + React 19 + TypeScript structured under `frontend/`.
2. **IndexedDB Data Layer (Dexie.js):** Client schemas for `habits`, `habit_logs`, and forward-compatible `plot_views` with UUID keys, soft deletes (`deleted = 1`), and `synced` flags.
3. **Habit CRUD Management:** Create, list, edit, and soft-delete habit definitions supporting `toggle`, `counter`, `numeric`, and generic `preset_accumulator`.
4. **Daily Habit Tracker View:** Date navigation and dynamic modular widgets allowing fast daily logging.
5. **Direct Entry Editing & Corrections:** Ability to directly edit or correct any log value for any habit on any date (e.g. manually overriding or fixing accumulator unit totals).
6. **Recent Logs History Table:** View, filter, and edit/delete past entries in a plain HTML table.
7. **Data Portability (Settings):** JSON export and import for full offline backup, restore, and profile transfer.
8. **Automated Unit & Integration Tests:** Vitest with `fake-indexeddb` verifying database transactions, soft deletes, accumulator logic, and export/import round-trips.

---

## 2. Technology Stack & Directory Structure

- **Runtime / Package Manager:** Node.js (v26+) with `npm`
- **Build Tool:** Vite
- **Frontend Framework:** React 19 + TypeScript
- **Reactive Database Client:** Dexie.js (v4) with `dexie-react-hooks` (`useLiveQuery`)
- **Testing:** Vitest + `@testing-library/react` + `fake-indexeddb`

### Repository Directory Structure

```text
habit_tracker/
├── .gitignore
├── LICENSE
├── README.md
├── plan/
│   ├── initial_plan.md
│   └── sprint_01.md
├── docs/
└── frontend/                       # Dedicated frontend client application
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx                 # Tab navigation: Track | Manage Habits | History | Settings
    │   ├── types/
    │   │   ├── habit.ts            # Habit, DataType, WidgetType, WidgetConfig definitions
    │   │   ├── log.ts              # HabitLog model
    │   │   └── export.ts           # Backup JSON export schema
    │   ├── db/
    │   │   ├── db.ts               # Dexie instance, table declarations & versioned schema
    │   │   └── seed.ts             # Optional seed data for development
    │   ├── components/
    │   │   ├── common/             # DatePicker, ErrorBanner, Modal/Inline editor
    │   │   ├── tracker/            # Daily Tracker view & dynamic widget dispatcher
    │   │   │   ├── DailyTracker.tsx
    │   │   │   ├── widgets/
    │   │   │   │   ├── ToggleWidget.tsx
    │   │   │   │   ├── CounterWidget.tsx
    │   │   │   │   ├── NumericWidget.tsx
    │   │   │   │   └── PresetAccumulatorWidget.tsx
    │   │   │   └── DirectValueEditor.tsx # Quick direct correction for any habit value
    │   │   ├── habits/             # Habit creation & configuration forms
    │   │   │   ├── HabitList.tsx
    │   │   │   ├── HabitForm.tsx
    │   │   │   └── PresetConfigBuilder.tsx # Generic preset button builder (label + value)
    │   │   ├── history/            # Tabular logs view
    │   │   │   ├── RecentLogsTable.tsx
    │   │   │   └── LogEditRow.tsx
    │   │   └── settings/           # Data backup & management
    │   │       ├── SettingsView.tsx
    │   │       └── BackupExportImport.tsx
    │   └── test/
    │       ├── setup.ts            # fake-indexeddb bootstrap
    │       ├── db.test.ts          # CRUD & soft-delete query tests
    │       ├── accumulator.test.ts # Delta additions & direct edit tests
    │       └── exportImport.test.ts# JSON backup and restore validation
```

---

## 3. Database Schema (IndexedDB via Dexie)

IndexedDB schemas strictly mirror the database specification in `initial_plan.md`. All synced entities use client-generated UUIDs (via `crypto.randomUUID()`) and epoch millisecond timestamps (`updated_at`). Soft deletes are represented by `deleted = 1` to ensure deletion propagation without resurrection when sync is introduced in Sprint 2.

```typescript
// frontend/src/db/db.ts
import Dexie, { type Table } from 'dexie';
import type { Habit, HabitLog, DerivedMetric, PlotView } from '../types';

export class HabitTrackerDB extends Dexie {
  habits!: Table<Habit, string>;
  habit_logs!: Table<HabitLog, string>;
  derived_metrics!: Table<DerivedMetric, string>;
  plot_views!: Table<PlotView, string>;

  constructor() {
    super('HabitTrackerDB');
    this.version(1).stores({
      habits: 'id, name, widget_type, updated_at, deleted, synced',
      habit_logs: 'id, habit_id, date, [habit_id+date], updated_at, deleted, synced',
      derived_metrics: 'id, name, updated_at, deleted, synced',
      plot_views: 'id, sort_order, updated_at, deleted, synced'
    });
  }
}

export const db = new HabitTrackerDB();
```

### Table Definitions

#### `habits`
- `id`: `string` (UUID v4, Primary Key)
- `name`: `string` (Human-readable habit title)
- `data_type`: `'binary' | 'integer' | 'float'`
- `unit`: `string | null` (e.g. `"km"`, `"hours"`, `"units"`, `null`)
- `is_good`: `boolean` (positive habit vs negative/bad habit)
- `default_value`: `number | null` (`null` = unlogged days are ignored/missing in stats; fixed number e.g. `0` = unlogged days count as that number)
- `widget_type`: `'toggle' | 'counter' | 'numeric' | 'preset_accumulator'`
- `config_json`: `string` (Serialized JSON holding widget presets, optional `default_picker_value` for pre-populating daily inputs, color/icon, target)
- `updated_at`: `number` (Epoch ms timestamp)
- `deleted`: `number` (`0` for active, `1` for soft-deleted)
- `synced`: `number` (Local-only indexable integer flag: `0` for unsynced changes, `1` for synced)

#### `habit_logs`
- `id`: `string` (UUID v4, Primary Key)
- `habit_id`: `string` (Foreign Key referencing `habits.id`)
- `date`: `string` (Format `YYYY-MM-DD`)
- `value`: `number` (The logged numeric value)
- `updated_at`: `number` (Epoch ms timestamp)
- `deleted`: `number` (`0` for active, `1` for soft-deleted)
- `synced`: `number` (Local-only indexable integer flag: `0` for unsynced, `1` for synced)
- *Index constraint:* Indexed on `[habit_id+date]` compound index for fast daily lookups.

#### `derived_metrics` *(Scaffolded in Sprint 1 schema, evaluated in Sprint 3)*
- `id`: `string` (UUID v4, Primary Key)
- `name`: `string`
- `unit`: `string | null`
- `is_good`: `boolean`
- `formula`: `string`
- `config_json`: `string`
- `updated_at`: `number`
- `deleted`: `number`
- `synced`: `number` (`0` for unsynced, `1` for synced)

#### `plot_views` *(Scaffolded for forward compatibility)*
- `id`: `string` (UUID v4, Primary Key)
- `title`: `string`
- `config_json`: `string`
- `sort_order`: `number`
- `updated_at`: `number`
- `deleted`: `number`
- `synced`: `number` (`0` for unsynced, `1` for synced)

---

## 4. Detailed Feature Breakdown & Acceptance Criteria

### Feature 1: Habit Definition Management (CRUD)
- **Goal:** Allow users to define new habits with flexible input types, statistical defaults, picker defaults, and modify or retire existing habits.
- **Components:** `HabitList.tsx`, `HabitForm.tsx`, `PresetConfigBuilder.tsx`.
- **Requirements:**
  1. Form inputs:
     - `Name`: string.
     - `Data Type`: `binary`, `integer`, `float`.
     - `Unit`: optional string.
     - `Is Good`: checkbox (defaults to checked).
     - `Statistical Default Value` (`default_value`): number or empty (`null`). Helper text explains: *Leave empty if unlogged days are ignored/missing in averages and plots (e.g. Weight, Sleep); or enter a number like 0 if unlogged days count as that value (e.g. 0 km biked, 0 units consumed)*.
     - `Default Picker Value` (`default_picker_value` stored in `config_json`): optional number pre-filling the tracker widget on unlogged days (e.g. pre-filling weight input to `75.0` even though `default_value` is `null`).
  2. `Widget Type` selector:
     - `toggle`: Restricted to `binary` data type.
     - `counter`: Available for `integer` or `float`.
     - `numeric`: Available for `integer` or `float`.
     - `preset_accumulator`: Allows adding generic preset buttons (e.g. Label: "Single", Delta: `1.0`; Label: "Half", Delta: `0.5`). Must remain completely domain-agnostic and generic without hardcoded presets.
  3. Editing: Users can modify name, unit, statistical default, picker default, and widget configurations.
  4. Soft Delete: Deleting a habit updates `deleted = 1`, `updated_at = Date.now()`, `synced = 0`. The habit immediately disappears from the active tracker and active habit list.

### Feature 2: Daily Habit Tracker View
- **Goal:** Provide a fast, zero-latency daily logging view.
- **Components:** `DailyTracker.tsx`, `DatePicker.tsx`, dynamic widgets.
- **Requirements:**
  1. Date Selector: Displays selected date (defaulting to current date in `YYYY-MM-DD`). Includes `[Prev Day]`, `[Today]`, `[Next Day]`, and a date input for jumping to any past or future date.
  2. Fetches all active habits (`WHERE deleted = 0`) and their corresponding logs for the selected date.
  3. Renders the appropriate modular widget based on `habit.widget_type`.
  4. Saving: Any change writes immediately to IndexedDB with millisecond timestamp and `synced = 0`.

### Feature 3: Modular Widgets & Direct Value Editing / Correction
- **Goal:** Provide fast logging interactions while ensuring users can always directly edit or correct values anytime.
- **Widgets:**
  1. **Binary Toggle (`ToggleWidget`):**
     - Button / Checkbox indicating `Done` (`1`) or `Not Done` (`0`). Toggling updates the day's record immediately.
  2. **Counter (`CounterWidget`):**
     - `[-]` and `[+]` buttons incrementing or decrementing by `1` (or step defined in config).
     - Inline number input allowing direct manual entry.
  3. **Numeric Input (`NumericWidget`):**
     - Direct numeric input with submit/blur save and display of unit label.
  4. **Preset Accumulator (`PresetAccumulatorWidget`):**
     - Displays the current day's cumulative total (e.g. `Current: 3.5 units`).
     - Renders configurable quick-tap preset buttons defined in the habit's `config_json` (e.g. `+1.0`, `+1.5`, `+0.5`). Tapping adds the delta to the current value.
     - Optional custom delta field: user can enter an arbitrary increment (e.g. `+2.2`) and tap `[Add]`.
     - **Direct Correction Feature:** Includes an `[Edit Total]` toggle/button enabling the user to directly correct the day's total value (e.g. changing `4.5` to `3.0` if an extra beverage was logged by mistake).

### Feature 4: Recent Logs History Table
- **Goal:** Provide visibility into recorded entries across habits and dates with inline correction capabilities.
- **Components:** `RecentLogsTable.tsx`, `LogEditRow.tsx`.
- **Requirements:**
  1. Displays recent log entries sorted by `date DESC, updated_at DESC`.
  2. Columns: `Date`, `Habit Name`, `Logged Value`, `Unit`, `Last Updated`, `Actions`.
  3. Actions per row:
     - `[Edit]`: Allows modifying the `value` directly. Updates `updated_at` and marks `synced = 0`.
     - `[Delete]`: Soft-deletes the log entry (`deleted = 1`, `updated_at = Date.now()`, `synced = 0`).

### Feature 5: Data Portability (JSON Export & Import)
- **Goal:** Guarantee complete data ownership and offline backup capabilities prior to backend sync availability.
- **Components:** `BackupExportImport.tsx`, `SettingsView.tsx`.
- **Requirements:**
  1. **Export JSON:** Dumps full database contents into a structured JSON file:
     ```json
     {
       "version": 1,
       "exported_at": 1732224000000,
       "habits": [...],
       "habit_logs": [...],
       "derived_metrics": [...],
       "plot_views": [...]
     }
     ```
     Triggering export downloads a file named `habit_tracker_backup_YYYY-MM-DD.json`.
  2. **Import JSON:**
     - Allows selecting a `.json` backup file.
     - Validates payload structure and version.
     - Provides two import modes:
       - **Merge / Upsert:** Upserts records using Last-Write-Wins based on `updated_at`.
       - **Replace / Overwrite:** Clears existing tables and loads records fresh from the backup.
  3. **Clear Database:** Confirmation button to wipe local IndexedDB for testing or fresh start.

---

## 5. Testing & Verification Strategy

### Automated Tests (`Vitest` + `fake-indexeddb`)
- `frontend/src/test/db.test.ts`:
  - Verify habits creation, retrieval, and updating.
  - Verify soft deletion (`deleted = 1`) and ensure active queries (`useLiveQuery` / Dexie filter) exclude soft-deleted records.
- `frontend/src/test/accumulator.test.ts`:
  - Verify cumulative additions for the `preset_accumulator` widget.
  - Verify direct total value corrections and ensure subsequent additions compute from the corrected base.
  - Verify uniqueness and upsert behavior on `(habit_id, date)`.
- `frontend/src/test/exportImport.test.ts`:
  - Verify JSON export schema generation.
  - Verify backup import restore and merge conflict resolution.

### Manual Verification Checklist
1. **Habit Creation:** Create habits for each widget type (`toggle`, `counter`, `numeric`, `preset_accumulator` with generic presets).
2. **Daily Logging:** Log values on today's date using each widget type; navigate to yesterday and verify date isolation.
3. **Value Correction:** Use the `preset_accumulator` to tap multiple presets, then use the direct editor to correct the total; verify the updated total is preserved.
4. **History Table:** Navigate to History tab; verify recent logs match input; edit a log value and soft-delete an entry.
5. **Export & Restore:** Export JSON backup, clear database, import backup, and verify all habits and history are accurately restored.
