import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getServerUrl } from '../../sync/settings';
import { useSyncState, type ConnectionStatus } from '../../sync/store';
import { performSync } from '../../sync/syncClient';
import { getUnsyncedSummary, type UnsyncedSummary } from '../../sync/unsynced';

const DOT_COLORS: Record<ConnectionStatus, string> = {
  unconfigured: '#9ca3af',
  connected: '#22c55e',
  disconnected: '#f97316',
  error: '#ef4444'
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  unconfigured: 'No server configured',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error'
};

const PULSE_CSS =
  '@keyframes habit-sync-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.7); opacity: 0.5; } }';

function formatTime(ms: number | null): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString();
}

function hostOf(url: string | null): string {
  if (!url) return 'not set';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function joinNames(rows: Array<{ name?: string; title?: string; emoji?: string | null }>): string {
  return rows
    .map((row) => {
      const label = row.name ?? row.title ?? '';
      return `${row.emoji ?? ''} ${label}`.trim();
    })
    .join(', ');
}

function UnsyncedSections({ summary }: { summary: UnsyncedSummary }) {
  if (summary.total === 0) {
    return <div style={{ color: '#166534' }}>All changes synced &check;</div>;
  }
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        Unsynced changes ({summary.total})
      </div>
      {summary.habits.length > 0 && (
        <div>
          Habits ({summary.habits.length}): {joinNames(summary.habits)}
        </div>
      )}
      {summary.derivedMetrics.length > 0 && (
        <div>
          Metrics ({summary.derivedMetrics.length}): {joinNames(summary.derivedMetrics)}
        </div>
      )}
      {summary.plotViews.length > 0 && (
        <div>
          Plots ({summary.plotViews.length}): {joinNames(summary.plotViews)}
        </div>
      )}
      {summary.logs.length > 0 && (
        <div>
          Entries ({summary.logs.length}):{' '}
          {summary.logsByHabit
            .map((entry) => {
              const label = entry.info
                ? `${entry.info.emoji ?? ''} ${entry.info.name}`.trim()
                : 'Unknown habit';
              return `${label} ${entry.count}`;
            })
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

/**
 * Top-right connection dot: green when connected (pulsing while syncing),
 * orange when disconnected, red on error, gray when unconfigured.
 * Clicking opens a popover with server info and the unsynced-changes summary.
 */
export const SyncStatusIndicator: React.FC = () => {
  const state = useSyncState();
  const [open, setOpen] = useState(false);
  const summary = useLiveQuery(getUnsyncedSummary, []);
  const serverUrl = getServerUrl();

  const color = DOT_COLORS[state.status];
  const tooltip = state.syncing
    ? 'Syncing…'
    : `${STATUS_LABELS[state.status]}${state.lastError ? ` — ${state.lastError}` : ''}`;

  return (
    <div style={{ position: 'absolute', top: '0.4rem', right: 0, zIndex: 30 }}>
      <style>{PULSE_CSS}</style>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={tooltip}
        aria-label={`Sync status: ${STATUS_LABELS[state.status]}`}
        style={{
          position: 'relative',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '0.35rem'
        }}
      >
        <span
          style={{
            display: 'block',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: color,
            opacity: state.status === 'unconfigured' ? 0.55 : 1,
            animation: state.syncing ? 'habit-sync-pulse 1.2s ease-in-out infinite' : 'none'
          }}
        />
        {summary && summary.total > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              minWidth: 15,
              height: 15,
              borderRadius: 8,
              background: '#111827',
              color: '#fff',
              fontSize: 10,
              lineHeight: '15px',
              padding: '0 3px'
            }}
          >
            {summary.total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 29, background: 'transparent' }}
          />
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: 0,
              width: 300,
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              padding: '0.75rem',
              fontSize: '0.85rem',
              textAlign: 'left',
              zIndex: 30
            }}
          >
            <div>
              <strong>Server:</strong> {hostOf(serverUrl)}
            </div>
            <div>
              <strong>Status:</strong> {state.syncing ? 'Syncing…' : STATUS_LABELS[state.status]}
              {state.serverVersion ? ` · v${state.serverVersion}` : ''}
            </div>
            <div>
              <strong>Last sync:</strong> {formatTime(state.lastSyncAt)}
            </div>
            {state.lastError && (
              <div style={{ color: '#b91c1c' }}>{state.lastError}</div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />

            {summary ? <UnsyncedSections summary={summary} /> : <div>Loading…</div>}

            <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => void performSync()}>
                Sync Now
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {!serverUrl && (
              <div style={{ marginTop: '0.4rem', color: '#6b7280' }}>
                Configure a server in Settings &amp; Backup.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
