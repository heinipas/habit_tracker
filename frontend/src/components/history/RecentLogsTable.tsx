import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { upsertHabitLog, softDeleteHabitLog } from '../../db/queries';
import type { HabitLog, Habit } from '../../types';

export const RecentLogsTable: React.FC = () => {
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Live query habits map
  const habits = useLiveQuery(
    () => db.habits.toArray(),
    []
  );

  // Live query recent active logs
  const logs = useLiveQuery(
    () => db.habit_logs.where('deleted').equals(0).reverse().sortBy('date'),
    []
  );

  const habitMap = new Map<string, Habit>();
  if (habits) {
    for (const h of habits) {
      habitMap.set(h.id, h);
    }
  }

  const handleStartEdit = (log: HabitLog) => {
    setEditingLogId(log.id);
    setEditValue(String(log.value));
  };

  const handleSaveEdit = async (log: HabitLog) => {
    const num = parseFloat(editValue);
    if (!isNaN(num)) {
      await upsertHabitLog(log.habit_id, log.date, num);
      setEditingLogId(null);
    }
  };

  const handleDelete = async (log: HabitLog) => {
    const habit = habitMap.get(log.habit_id);
    const habitName = habit ? `${habit.emoji ? `${habit.emoji} ` : ''}${habit.name}` : 'Unknown Habit';
    if (window.confirm(`Delete entry of ${log.value} for ${habitName} on ${log.date}?`)) {
      await softDeleteHabitLog(log.id);
    }
  };

  return (
    <div>
      <h2>Recent Logs History</h2>

      {(!logs || logs.length === 0) ? (
        <p>No logged entries recorded yet.</p>
      ) : (
        <table border={1} cellPadding={6} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Habit</th>
              <th>Value</th>
              <th>Unit</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 100).map((log) => {
              const habit = habitMap.get(log.habit_id);
              const isEditing = editingLogId === log.id;

              return (
                <tr key={log.id}>
                  <td><strong>{log.date}</strong></td>
                  <td>{habit ? `${habit.emoji ? `${habit.emoji} ` : ''}${habit.name}` : <em>(Deleted Habit)</em>}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ width: '80px' }}
                      />
                    ) : (
                      <strong>{log.value}</strong>
                    )}
                  </td>
                  <td>{habit?.unit || '—'}</td>
                  <td><small>{new Date(log.updated_at).toLocaleString()}</small></td>
                  <td>
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => handleSaveEdit(log)}>Save</button>
                        {' '}
                        <button type="button" onClick={() => setEditingLogId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => handleStartEdit(log)}>Edit</button>
                        {' '}
                        <button type="button" onClick={() => handleDelete(log)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
