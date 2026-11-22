import React, { useState } from 'react';
import { exportDatabaseToJson, importDatabaseFromJson, clearAllData } from '../../db/queries';
import type { BackupPayload } from '../../types';

export const BackupExportImport: React.FC = () => {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const data = await exportDatabaseToJson();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `habit_tracker_backup_${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage('Export downloaded successfully.');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Export failed');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const text = await file.text();
      const parsed: BackupPayload = JSON.parse(text);

      const result = await importDatabaseFromJson(parsed, importMode);
      setStatusMessage(`Import successful (${importMode} mode): ${result.habitsCount} habits, ${result.logsCount} logs processed.`);
      // Clear file input
      e.target.value = '';
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to import backup file.');
    }
  };

  const handleClearDatabase = async () => {
    if (window.confirm('CAUTION: Are you sure you want to completely erase all habits and logs on this device? This action cannot be undone unless you have a JSON backup.')) {
      await clearAllData();
      setStatusMessage('Database wiped successfully.');
    }
  };

  return (
    <div>
      <h2>Settings & Data Portability</h2>

      {statusMessage && <p style={{ color: 'green' }}><strong>✓ {statusMessage}</strong></p>}
      {errorMessage && <p style={{ color: 'red' }}><strong>× {errorMessage}</strong></p>}

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend><strong>Export Local Data</strong></legend>
        <p>Export all habits, logs, derived metrics, and chart views to a portable JSON backup file.</p>
        <button type="button" onClick={handleExport}>Download JSON Backup</button>
      </fieldset>

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend><strong>Import Data Backup</strong></legend>
        <p>Select a previously exported JSON backup file to restore:</p>
        <div style={{ marginBottom: '0.75rem' }}>
          <label><strong>Import Mode: </strong></label>
          <label>
            <input
              type="radio"
              name="import-mode"
              value="merge"
              checked={importMode === 'merge'}
              onChange={() => setImportMode('merge')}
            />
            {' '}Merge (Last-Write-Wins on updated_at)
          </label>
          {' '}
          <label>
            <input
              type="radio"
              name="import-mode"
              value="replace"
              checked={importMode === 'replace'}
              onChange={() => setImportMode('replace')}
            />
            {' '}Replace (Wipe existing & load backup)
          </label>
        </div>
        <input type="file" accept=".json" onChange={handleFileChange} />
      </fieldset>

      <fieldset style={{ border: '1px solid red' }}>
        <legend><strong style={{ color: 'red' }}>Danger Zone</strong></legend>
        <p>Erase all local records from browser IndexedDB storage.</p>
        <button type="button" onClick={handleClearDatabase} style={{ color: 'red' }}>
          Wipe All Local Data
        </button>
      </fieldset>
    </div>
  );
};
