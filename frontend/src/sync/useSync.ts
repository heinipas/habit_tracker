import { useEffect } from 'react';
import { healthCheck, installSyncTriggers, performSync, scheduleSync } from './syncClient';
import { setSyncState } from './store';

/**
 * App-wide sync orchestration: registers local-write triggers, then reacts to
 * app open, tab focus, and network connectivity changes.
 */
export function useSync(): void {
  useEffect(() => {
    installSyncTriggers();

    // Initial check + first sync (no-op when no server is configured).
    void healthCheck();
    void performSync();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void healthCheck();
        scheduleSync(500);
      }
    };
    const onOnline = () => {
      void healthCheck();
      scheduleSync(0);
    };
    const onOffline = () => {
      setSyncState({ status: 'disconnected', lastError: 'Network offline' });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const healthTimer = setInterval(() => void healthCheck(), 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(healthTimer);
    };
  }, []);
}
