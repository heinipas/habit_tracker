import React from 'react';
import type { Habit, HabitLog, HabitConfig } from '../../../types';
import { upsertHabitLog } from '../../../db/queries';

interface WidgetProps {
  habit: Habit;
  log?: HabitLog;
  date: string;
}

export const ToggleWidget: React.FC<WidgetProps> = ({ habit, log, date }) => {
  let config: HabitConfig = {};
  try {
    config = JSON.parse(habit.config_json || '{}');
  } catch {
    // fallback
  }

  // If already logged, reflect log value.
  // If unlogged (log === undefined), respect default_picker_value (1 = checked by default)
  const defaultChecked = config.default_picker_value === 1;
  const isDone = log ? log.value > 0 : defaultChecked;

  const handleToggle = async () => {
    const nextVal = isDone ? 0 : 1;
    await upsertHabitLog(habit.id, date, nextVal);
  };

  return (
    <div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={isDone}
          onChange={handleToggle}
        />
        <span>Done</span>
      </label>
    </div>
  );
};
