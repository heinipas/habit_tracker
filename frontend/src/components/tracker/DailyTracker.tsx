import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { DatePicker } from '../common/DatePicker';
import { ToggleWidget } from './widgets/ToggleWidget';
import { CounterWidget } from './widgets/CounterWidget';
import { PresetAccumulatorWidget } from './widgets/PresetAccumulatorWidget';
import { softDeleteHabitLog, reorderHabits } from '../../db/queries';
import type { Habit, HabitLog } from '../../types';

export const DailyTracker: React.FC = () => {
  const getTodayDate = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());

  // Reactive query for active habits (deleted === 0)
  const habits = useLiveQuery(
    () => db.habits.where('deleted').equals(0).toArray(),
    []
  );

  // Reactive query for logs on selected date
  const logs = useLiveQuery(
    () => db.habit_logs.where('date').equals(selectedDate).filter((l) => l.deleted === 0).toArray(),
    [selectedDate]
  );

  const logsByHabitId = new Map<string, HabitLog>();
  if (logs) {
    for (const log of logs) {
      logsByHabitId.set(log.habit_id, log);
    }
  }

  const handleReset = async (logId: string) => {
    await softDeleteHabitLog(logId);
  };

  // Habits in the user-defined order; habits without a position keep DB order
  const orderedHabits = (habits ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    );

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= orderedHabits.length) return;
    const reordered = [...orderedHabits];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await reorderHabits(reordered.map((habit) => habit.id));
  };

  const reorderButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '0.1rem 0.4rem',
    fontSize: '0.8rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    color: '#374151',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1
  });

  const renderWidget = (habit: Habit) => {
    const log = logsByHabitId.get(habit.id);
    switch (habit.widget_type) {
      case 'toggle':
        return <ToggleWidget habit={habit} log={log} date={selectedDate} />;
      case 'counter':
        return <CounterWidget habit={habit} log={log} date={selectedDate} />;
      case 'preset_accumulator':
        return <PresetAccumulatorWidget habit={habit} log={log} date={selectedDate} />;
      default:
        return <div>Unknown widget: {habit.widget_type}</div>;
    }
  };

  return (
    <div>
      <h2>Daily Tracker</h2>
      <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {(!habits || habits.length === 0) ? (
        <p>No active habits yet. Go to <strong>Manage Habits</strong> to add your first habit!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orderedHabits.map((habit, index) => {
            const log = logsByHabitId.get(habit.id);
            const hasEntry = !!log;
            const isShaded = !hasEntry;

            return (
              <fieldset
                key={habit.id}
                style={{
                  backgroundColor: isShaded ? '#f4f4f5' : '#ffffff',
                  borderColor: isShaded ? '#d1d5db' : '#e5e7eb',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  transition: 'background-color 0.2s ease, border-color 0.2s ease'
                }}
              >
                <legend style={{ padding: '0 0.5rem' }}>
                  <strong>{habit.emoji ? `${habit.emoji} ` : ''}{habit.name}</strong>
                  {habit.unit && <small> ({habit.unit})</small>}
                  {!habit.is_good && <small style={{ color: '#888' }}></small>}
                  {isShaded && (
                    <small style={{ color: '#6b7280', marginLeft: '0.5rem', fontStyle: 'italic' }}>
                      (n/a)
                    </small>
                  )}
                </legend>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>{renderWidget(habit)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {hasEntry && (
                      <button
                        type="button"
                        onClick={() => handleReset(log.id)}
                        title="Remove database entry and revert to shaded"
                        aria-label="Reset entry"
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '1rem',
                          lineHeight: 1,
                          cursor: 'pointer',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          color: '#374151'
                        }}
                      >
                        ↺
                      </button>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        title="Move habit up"
                        style={reorderButtonStyle(index === 0)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(index, 1)}
                        disabled={index === orderedHabits.length - 1}
                        title="Move habit down"
                        style={reorderButtonStyle(index === orderedHabits.length - 1)}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
};
