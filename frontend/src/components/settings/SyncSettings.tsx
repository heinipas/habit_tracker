import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getApiKey, getServerUrl, saveSyncSettings } from '../../sync/settings';
import { useSyncState, type ConnectionStatus } from '../../sync/store';
import { forcePull, forcePush, healthCheck, performSync } from '../../sync/syncClient';
import { getUnsyncedSummary } from '../../sync/unsynced';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  unconfigured: 'No server configured',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error'
};

function statusColor(status: ConnectionStatus): string {
  if (status === 'connected') return '#166534';
  if (status === 'disconnected') return '#c2410c';
  if (status === 'error') return '#b91c1c';
  return '#6b7280';
}

export const SyncSettings: React.FC = () => {
  const [serverUrl, setServerUrl] = useState(() => getServerUrl() ?? '');
  const [apiKey, setApiKey] = useState(() => getApiKey());
  const [message, setMessage] = useState<string | null>(null);
  const state = useSyncState();
  const summary = useLiveQuery(getUnsyncedSummary, []);

  const handleSave = () => {
    saveSyncSettings(serverUrl, apiKey);
    setMessage('Settings saved — connecting…');
    void healthCheck();
    void performSync();
  };

  const handleSyncNow = async () => {
    setMessage(null);
    await performSync();
  };

  const handleForcePull = async () => {
    setMessage(null);
    const confirmed = window.confirm(
      'Force Pull: overwrite local data with the server?\n\n' +
        'Server data wins on conflicts. Local changes newer than the server are kept and will be pushed afterwards.'
    );
    if (confirmed) {
      await forcePull();
    }
  };

  const handleForcePush = async () => {
    setMessage(null);
    const confirmed = window.confirm(
      'Force Push: mark ALL local changes as unsynced and push the entire local database to the server?\n\n' +
        'This lets this device overwrite older server data.'
    );
    if (confirmed) {
      await forcePush();
    }
  };

  const label = state.syncing ? 'Syncing…' : STATUS_LABELS[state.status];
  const configured = getServerUrl() !== null;

  return (
    <div>
      <h2>Sync Server</h2>
      {message && (
        <p style={{ color: 'green' }}>
          <strong>&check; {message}</strong>
        </p>
      )}

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend>
          <strong>Connection</strong>
        </legend>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="sync-server-url">
            <strong>Sync Server URL: </strong>
          </label>
          <input
            id="sync-server-url"
            type="url"
            placeholder="https://raspberrypi.example.ts.net"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            style={{ width: '100%', maxWidth: '420px' }}
          />
          <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
            HTTPS endpoint of your self-hosted sync server (no trailing slash).
          </div>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="sync-api-key">
            <strong>API Key: </strong>
          </label>
          <input
            id="sync-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: '100%', maxWidth: '420px' }}
          />
        </div>
        <button type="button" onClick={handleSave}>
          Save
        </button>{' '}
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          disabled={!configured}
          title={configured ? undefined : 'Save a server URL first'}
        >
          Sync Now
        </button>

        <p style={{ color: statusColor(state.status), marginBottom: 0 }}>
          <strong>Status: {label}</strong>
          {summary ? ` · ${summary.total} unsynced change(s)` : ''}
          {state.serverVersion ? ` · server v${state.serverVersion}` : ''}
          {state.lastSyncAt ? ` · last sync ${new Date(state.lastSyncAt).toLocaleString()}` : ''}
          {state.lastError ? <span style={{ color: '#b91c1c' }}> · {state.lastError}</span> : null}
        </p>
      </fieldset>

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend>
          <strong>Advanced Resync</strong>
        </legend>
        <p>Recover from server rebuilds, manual SQL edits, or diverged devices.</p>
        <button
          type="button"
          onClick={() => void handleForcePull()}
          disabled={!configured}
          title={configured ? undefined : 'Save a server URL first'}
        >
          Force Pull from Server
        </button>{' '}
        <button
          type="button"
          onClick={() => void handleForcePush()}
          disabled={!configured}
          title={configured ? undefined : 'Save a server URL first'}
        >
          Force Push to Server
        </button>
        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Force Pull: newer server data overwrites older local changes; newer local changes are kept.
          <br />
          Force Push: uploads every local row, overwriting older server data.
        </div>
      </fieldset>
    </div>
  );
};
