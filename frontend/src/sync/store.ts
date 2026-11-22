import { useSyncExternalStore } from 'react';

export type ConnectionStatus = 'unconfigured' | 'connected' | 'disconnected' | 'error';

export interface SyncState {
  status: ConnectionStatus;
  syncing: boolean;
  lastSyncAt: number | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  serverVersion: string | null;
}

const initialState: SyncState = {
  status: 'unconfigured',
  syncing: false,
  lastSyncAt: null,
  lastCheckedAt: null,
  lastError: null,
  serverVersion: null
};

let state: SyncState = initialState;
const listeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function resetSyncState(): void {
  setSyncState(initialState);
}

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}
