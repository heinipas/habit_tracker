import type { Table } from 'dexie';
import { db } from '../db/db';
import { getApiKey, getLastSyncedAt, getServerUrl, setLastSyncedAt } from './settings';
import { getSyncState, setSyncState } from './store';
import { emptySyncRequest, type HealthResponse, type SyncRequest, type SyncResponse } from './types';

const TIMEOUT_MS = 15000;
const SYNCED_TABLES = ['habits', 'habit_logs', 'derived_metrics', 'plot_views'] as const;

let inFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let healthInFlight = false;
let suppressTriggers = 0;
let writeHooksInstalled = false;

/** Network-level failure (offline, DNS, timeout) → orange "disconnected" dot. */
class DisconnectedError extends Error {}
/** The server answered but rejected the request → red "error" dot. */
class HttpError extends Error {}

interface RowLike {
  id: string;
  updated_at: number;
  synced: number;
}

function classify(err: unknown): { status: 'disconnected' | 'error'; message: string } {
  if (err instanceof DisconnectedError) return { status: 'disconnected', message: err.message };
  if (err instanceof HttpError) return { status: 'error', message: err.message };
  return { status: 'error', message: err instanceof Error ? err.message : String(err) };
}

/** Timeout for sync requests, with a fallback for older browsers. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    // e.g. a tunnel or proxy returning an HTML error page instead of JSON.
    throw new HttpError('Invalid response from server (expected JSON)');
  }
}

async function postJson(url: string, path: string, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(TIMEOUT_MS)
    });
  } catch {
    throw new DisconnectedError('Server unreachable (network error or timeout)');
  }
  if (response.status === 401) throw new HttpError('Invalid API key (401)');
  if (!response.ok) throw new HttpError(`Server error (${response.status})`);
  return await readJson(response);
}

async function getJson(url: string, path: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { signal: timeoutSignal(TIMEOUT_MS) });
  } catch {
    throw new DisconnectedError('Server unreachable (network error or timeout)');
  }
  if (!response.ok) throw new HttpError(`Server error (${response.status})`);
  return await readJson(response);
}

async function collectUnsynced(): Promise<SyncRequest> {
  const [habits, habit_logs, derived_metrics, plot_views] = await Promise.all([
    db.habits.where('synced').equals(0).toArray(),
    db.habit_logs.where('synced').equals(0).toArray(),
    db.derived_metrics.where('synced').equals(0).toArray(),
    db.plot_views.where('synced').equals(0).toArray()
  ]);
  return { last_synced_at: getLastSyncedAt(), habits, habit_logs, derived_metrics, plot_views };
}

async function markPushed(
  table: Table<any, string>,
  rows: RowLike[]
): Promise<void> {
  for (const row of rows) {
    const local = await table.get(row.id);
    // Only mark when the row was not edited while the request was in flight;
    // otherwise it stays `synced = 0` and is pushed again next cycle.
    if (local && local.updated_at === row.updated_at && local.synced === 0) {
      await table.update(row.id, { synced: 1 });
    }
  }
}

async function applyIncoming(table: Table<any, string>, incoming: any): Promise<void> {
  const local = await table.get(incoming.id);
  if (!local) {
    await table.put({ ...incoming, synced: 1 });
    return;
  }
  if (incoming.updated_at > local.updated_at) {
    // Server copy is newer: Last-Write-Wins — replace local (any pending
    // local edit for this row is older and therefore superseded).
    await table.put({ ...incoming, synced: 1 });
  }
  // Local copy is newer or equal: keep it; an unsynced local edit stays queued.
}

/** Keep at most one log row per (habit_id, date), newest `updated_at` wins. */
async function dedupeHabitLogs(): Promise<void> {
  const logs = await db.habit_logs.toArray();
  const byPair = new Map<string, typeof logs>();
  for (const log of logs) {
    const key = `${log.habit_id}\u0000${log.date}`;
    const group = byPair.get(key);
    if (group) {
      group.push(log);
    } else {
      byPair.set(key, [log]);
    }
  }
  for (const group of byPair.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.updated_at - a.updated_at);
    const [, ...losers] = group;
    for (const loser of losers) {
      await db.habit_logs.delete(loser.id);
    }
  }
}

async function commitSync(data: SyncResponse, pushed: SyncRequest): Promise<void> {
  suppressTriggers += 1;
  try {
    await db.transaction(
      'rw',
      [db.habits, db.habit_logs, db.derived_metrics, db.plot_views],
      async () => {
        await markPushed(db.habits, pushed.habits);
        await markPushed(db.habit_logs, pushed.habit_logs);
        await markPushed(db.derived_metrics, pushed.derived_metrics);
        await markPushed(db.plot_views, pushed.plot_views);

        for (const row of data.habits) await applyIncoming(db.habits, row);
        for (const row of data.habit_logs) await applyIncoming(db.habit_logs, row);
        for (const row of data.derived_metrics) await applyIncoming(db.derived_metrics, row);
        for (const row of data.plot_views) await applyIncoming(db.plot_views, row);

        await dedupeHabitLogs();
      }
    );
  } finally {
    suppressTriggers -= 1;
  }
}

async function runSyncCycle(url: string, buildRequest: () => Promise<SyncRequest> | SyncRequest): Promise<void> {
  setSyncState({ syncing: true });
  try {
    const request = await buildRequest();
    const data = (await postJson(url, '/api/v1/sync', request)) as SyncResponse;
    await commitSync(data, request);
    setLastSyncedAt(data.server_time);
    setSyncState({
      syncing: false,
      status: 'connected',
      lastSyncAt: Date.now(),
      lastError: null
    });
  } catch (err) {
    const { status, message } = classify(err);
    setSyncState({ syncing: false, status, lastError: message, lastCheckedAt: Date.now() });
  }
}

async function doPerformSync(): Promise<void> {
  const url = getServerUrl();
  if (!url) {
    setSyncState({ status: 'unconfigured' });
    return;
  }
  await runSyncCycle(url, collectUnsynced);
}

/** Run a sync cycle; concurrent calls coalesce into the in-flight one. */
export function performSync(): Promise<void> {
  if (!inFlight) {
    inFlight = doPerformSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function drainInFlight(): Promise<void> {
  while (inFlight) {
    await inFlight;
  }
}

/**
 * Force Pull: fetch the entire server state (`last_synced_at = 0`, no push).
 * Server rows overwrite older local rows; local rows newer than the server
 * (or unknown to it) are kept and stay queued for the next push.
 */
export async function forcePull(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  await drainInFlight();
  await runSyncCycle(url, emptySyncRequest);
}

/** Force Push: queue every local row and push the full local database. */
export async function forcePush(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  await drainInFlight();
  suppressTriggers += 1;
  try {
    await db.transaction(
      'rw',
      [db.habits, db.habit_logs, db.derived_metrics, db.plot_views],
      async () => {
        await db.habits.toCollection().modify({ synced: 0 });
        await db.habit_logs.toCollection().modify({ synced: 0 });
        await db.derived_metrics.toCollection().modify({ synced: 0 });
        await db.plot_views.toCollection().modify({ synced: 0 });
      }
    );
  } finally {
    suppressTriggers -= 1;
  }
  await performSync();
}

/** Liveness probe for the status dot; also picks up the server version. */
export async function healthCheck(): Promise<void> {
  const url = getServerUrl();
  if (!url) {
    setSyncState({ status: 'unconfigured', serverVersion: null, lastError: null });
    return;
  }
  if (healthInFlight) return;
  healthInFlight = true;
  try {
    const data = (await getJson(url, '/api/v1/health')) as HealthResponse;
    const current = getSyncState();
    setSyncState({
      serverVersion: typeof data.version === 'string' ? data.version : null,
      lastCheckedAt: Date.now(),
      // A sync-level failure (e.g. 401) is only cleared by a successful sync,
      // never by the unauthenticated health endpoint.
      ...(current.status === 'error' ? {} : { status: 'connected' as const, lastError: null })
    });
    if (current.status === 'error') {
      // Re-test the sync endpoint so a stale error clears once the actual
      // failure (401, 5xx) is resolved — and persists while it is not.
      void performSync();
    }
  } catch (err) {
    const { status, message } = classify(err);
    setSyncState({ status, lastError: message, lastCheckedAt: Date.now() });
  } finally {
    healthInFlight = false;
  }
}

/** Debounced auto-sync after local edits (write hooks below). */
export function scheduleSync(delayMs = 2000): void {
  if (suppressTriggers > 0) return;
  if (!getServerUrl()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void performSync();
  }, delayMs);
}

/** Cancel a pending debounced sync (used when disabling sync and by tests). */
export function cancelScheduledSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Trigger a sync after any local write to a synced table. Registered once for
 * the app lifetime; writes made while applying server data are suppressed so
 * syncing never loops on itself.
 */
export function installSyncTriggers(): void {
  if (writeHooksInstalled) return;
  writeHooksInstalled = true;
  const onChange = () => scheduleSync();
  for (const name of SYNCED_TABLES) {
    const table = db[name] as Table<any, string>;
    table.hook('creating', onChange);
    table.hook('updating', onChange);
    table.hook('deleting', onChange);
  }
}
