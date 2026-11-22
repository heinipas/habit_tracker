import React, { useState } from 'react';
import { DailyTracker } from './components/tracker/DailyTracker';
import { HabitList } from './components/habits/HabitList';
import { RecentLogsTable } from './components/history/RecentLogsTable';
import { BackupExportImport } from './components/settings/BackupExportImport';
import { db } from './db/db';
import packageJson from '../package.json';

type Tab = 'tracker' | 'habits' | 'history' | 'settings';

// Frontend version shown in the footer (X.X.X, e.g. 0.1.0)
const frontendVersion = packageJson.version;

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tracker');

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Habit Tracker</h1>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            style={{ fontWeight: activeTab === 'tracker' ? 'bold' : 'normal' }}
          >
            Daily Tracker
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('habits')}
            style={{ fontWeight: activeTab === 'habits' ? 'bold' : 'normal' }}
          >
            Manage Habits
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{ fontWeight: activeTab === 'history' ? 'bold' : 'normal' }}
          >
            History
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{ fontWeight: activeTab === 'settings' ? 'bold' : 'normal' }}
          >
            Settings & Backup
          </button>
        </nav>
      </header>

      <main>
        {activeTab === 'tracker' && <DailyTracker />}
        {activeTab === 'habits' && <HabitList />}
        {activeTab === 'history' && <RecentLogsTable />}
        {activeTab === 'settings' && <BackupExportImport />}
      </main>

      {activeTab === 'settings' && (
        <footer
          style={{
            marginTop: '2rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid #ddd',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.8rem'
          }}
        >
          Frontend v{frontendVersion} · Database v{db.verno}
        </footer>
      )}
    </div>
  );
};
