import './setup';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/db';
import { clearAllData, saveHabit } from '../db/queries';
import {
  getApiKey,
  getLastSyncedAt,
  getServerUrl,
  saveSyncSettings,
  setLastSyncedAt
} from '../sync/settings';
import { getSyncState, resetSyncState } from '../sync/store';
import { cancelScheduledSync, forcePull, healthCheck, performSync } from '../sync/syncClient';

const SERVER = 'https://raspberrypi.example.ts.net';
const API_KEY = 'test-key';

function emptyPayload(serverTime = 999) {
  return {
    server_time: serverTime,
    habits: [],
    habit_logs: [],
    derived_metrics: [],
    plot_views: []
  };
}

async function seedHabit(overrides: Partial<Parameters<typeof saveHabit>[0]> = {}) {
  return saveHabit({
    name: 'Cycling',
    data_type: 'float',
    unit: 'km',
    is_good: true,
    default_value: 0,
    widget_type: 'counter',
    config_json: '{}',
    ...overrides
  });
}

describe('Sync client', () => {
  beforeEach(async () => {
    saveSyncSettings('', '');
    setLastSyncedAt(0);
    resetSyncState();
    await clearAllData();
  });

  afterEach(() => {
    cancelScheduledSync();
    vi.unstubAllGlobals();
  });

  it('pushes unsynced rows, marks them synced and stores server_time', async () => {
    const habit = await seedHabit();
    saveSyncSettings(SERVER, API_KEY);

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => emptyPayload(12345)
    });
    vi.stubGlobal('fetch', fetchMock);

    await performSync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SERVER}/api/v1/sync`);
    const body = JSON.parse(init.body);
    expect(body.last_synced_at).toBe(0);
    expect(body.habits).toHaveLength(1);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);

    const stored = await db.habits.get(habit.id);
    expect(stored?.synced).toBe(1);
    expect(getLastSyncedAt()).toBe(12345);
    expect(getSyncState().status).toBe('connected');
    expect(getSyncState().lastError).toBeNull();
  });

  it('leaves rows unsynced and reports disconnected on network failure', async () => {
    const habit = await seedHabit();
    saveSyncSettings(SERVER, API_KEY);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    );

    await performSync();

    const stored = await db.habits.get(habit.id);
    expect(stored?.synced).toBe(0);
    expect(getSyncState().status).toBe('disconnected');
    expect(getSyncState().lastError).toContain('unreachable');
    expect(getLastSyncedAt()).toBe(0);
  });

  it('reports an error state on HTTP 401 (wrong API key)', async () => {
    await seedHabit();
    saveSyncSettings(SERVER, 'wrong-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({ detail: 'Invalid API key' }) })
    );

    await performSync();

    expect(getSyncState().status).toBe('error');
    expect(getSyncState().lastError).toContain('401');
    const unsynced = await db.habits.where('synced').equals(0).toArray();
    expect(unsynced).toHaveLength(1);
  });

  it('force pull applies newer server rows over older local rows', async () => {
    const habit = await seedHabit({ name: 'Local Name' });
    saveSyncSettings(SERVER, API_KEY);
    await db.habits.update(habit.id, { updated_at: 3000 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          ...emptyPayload(777),
          habits: [
            {
              ...habit,
              name: 'Server Name',
              updated_at: 5000,
              synced: undefined
            }
          ]
        })
      })
    );

    await forcePull();

    const stored = await db.habits.get(habit.id);
    expect(stored?.name).toBe('Server Name');
    expect(stored?.updated_at).toBe(5000);
    expect(stored?.synced).toBe(1);
    expect(getLastSyncedAt()).toBe(777);
  });

  it('force pull keeps local rows newer than the server queued for push', async () => {
    const habit = await seedHabit({ name: 'Newer Local' });
    saveSyncSettings(SERVER, API_KEY);
    await db.habits.update(habit.id, { updated_at: 7000 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          ...emptyPayload(777),
          habits: [{ ...habit, name: 'Older Server', updated_at: 5000, synced: undefined }]
        })
      })
    );

    await forcePull();

    const stored = await db.habits.get(habit.id);
    expect(stored?.name).toBe('Newer Local');
    expect(stored?.updated_at).toBe(7000);
    expect(stored?.synced).toBe(0);
  });

  it('keeps a local edit made while a sync is in flight unsynced', async () => {
    const habit = await seedHabit({ name: 'Before Sync' });
    saveSyncSettings(SERVER, API_KEY);

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      // Simulate the user editing the habit while the request is on the wire.
      await db.habits.update(habit.id, {
        name: 'Edited Mid-Flight',
        updated_at: habit.updated_at + 10_000,
        synced: 0
      });
      return {
        status: 200,
        ok: true,
        // Server echoes the row exactly as it was pushed.
        json: async () => ({ ...emptyPayload(999), habits: request.habits })
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await performSync();

    const stored = await db.habits.get(habit.id);
    expect(stored?.name).toBe('Edited Mid-Flight');
    expect(stored?.synced).toBe(0);
    expect(getSyncState().status).toBe('connected');
  });

  it('health check records the server version and triggers a sync cycle', async () => {
    saveSyncSettings(SERVER, API_KEY);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/v1/health')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'ok', server_time: 1, version: '0.1.0' })
        };
      }
      return { status: 200, ok: true, json: async () => emptyPayload(5000) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await healthCheck();

    // The successful probe kicks off a background sync cycle; wait for it.
    await vi.waitFor(() => expect(getSyncState().lastSyncAt).not.toBeNull());
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/v1/sync'))
    ).toBe(true);
    expect(getSyncState().status).toBe('connected');
    expect(getSyncState().serverVersion).toBe('0.1.0');
    expect(getLastSyncedAt()).toBe(5000);
  });

  it('does nothing when no server URL is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await performSync();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().status).toBe('unconfigured');
  });
});

describe('Sync settings', () => {
  it('normalizes trailing slashes and resets the cursor when the URL changes', () => {
    saveSyncSettings(`${SERVER}/`, API_KEY);
    expect(getServerUrl()).toBe(SERVER);
    expect(getApiKey()).toBe(API_KEY);

    setLastSyncedAt(5000);
    expect(getLastSyncedAt()).toBe(5000);

    saveSyncSettings('https://other.example.com', API_KEY);
    expect(getLastSyncedAt()).toBe(0);
  });
});
