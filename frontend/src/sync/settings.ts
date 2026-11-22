const SERVER_URL_KEY = 'habit_tracker.server_url';
const API_KEY_KEY = 'habit_tracker.api_key';
const LAST_SYNCED_KEY = 'habit_tracker.last_synced_at';

// localStorage can be unavailable (private mode, tests); fall back to memory.
const memory = new Map<string, string>();

function read(key: string): string | null {
  const stored = memory.get(key);
  if (stored !== undefined) return stored;
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore unavailable storage
  }
  return null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore unavailable storage
  }
}

/** Normalized server URL (trailing slashes stripped) or null when not configured. */
export function getServerUrl(): string | null {
  const raw = read(SERVER_URL_KEY)?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function getApiKey(): string {
  return read(API_KEY_KEY) ?? '';
}

/**
 * Persist sync credentials. Changing the server URL resets the pull cursor so
 * the new server is always fully pulled on the next sync.
 */
export function saveSyncSettings(serverUrl: string, apiKey: string): void {
  const previous = getServerUrl();
  const normalized = serverUrl.trim().replace(/\/+$/, '');
  write(SERVER_URL_KEY, normalized);
  write(API_KEY_KEY, apiKey.trim());
  if (normalized !== previous) {
    setLastSyncedAt(0);
  }
}

export function getLastSyncedAt(): number {
  const value = Number(read(LAST_SYNCED_KEY));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function setLastSyncedAt(timestamp: number): void {
  write(LAST_SYNCED_KEY, String(Math.max(0, Math.floor(timestamp))));
}
