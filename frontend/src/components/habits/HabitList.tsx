import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { softDeleteHabit } from '../../db/queries';
import { HabitForm } from './HabitForm';
import type { Habit } from '../../types';

export const HabitList: React.FC = () => {
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Live query active habits
  const habits = useLiveQuery(
    () => db.habits.where('deleted').equals(0).toArray(),
    []
  );

  const handleDelete = async (habit: Habit) => {
    const habitTitle = `${habit.emoji ? `${habit.emoji} ` : ''}${habit.name}`;
    if (window.confirm(`Are you sure you want to delete "${habitTitle}"? Past logs will be preserved.`)) {
      await softDeleteHabit(habit.id);
    }
  };

  return (
    <div>
      <h2>Manage Habits</h2>

      {!isCreating && !editingHabit && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          style={{ marginBottom: '1rem' }}
        >
          + Create New Habit
        </button>
      )}

      {isCreating && (
        <HabitForm
          onDone={() => setIsCreating(false)}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {editingHabit && (
        <HabitForm
          existingHabit={editingHabit}
          onDone={() => setEditingHabit(null)}
          onCancel={() => setEditingHabit(null)}
        />
      )}

      {(!habits || habits.length === 0) ? (
        <p>No active habits defined yet.</p>
      ) : (
        <table border={1} cellPadding={6} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Data Type</th>
              <th>Unit</th>
              <th>Good / Bad</th>
              <th>Stat Default</th>
              <th>Widget Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => (
              <tr key={habit.id}>
                <td><strong>{habit.emoji ? `${habit.emoji} ` : ''}{habit.name}</strong></td>
                <td>{habit.data_type}</td>
                <td>{habit.unit || '—'}</td>
                <td>{habit.is_good ? 'Good (+)' : 'Bad (-)'}</td>
                <td>{habit.default_value != null ? habit.default_value : 'null (missing)'}</td>
                <td><code>{habit.widget_type}</code></td>
                <td>
                  <button type="button" onClick={() => { setEditingHabit(habit); setIsCreating(false); }}>
                    Edit
                  </button>
                  {' '}
                  <button type="button" onClick={() => handleDelete(habit)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
