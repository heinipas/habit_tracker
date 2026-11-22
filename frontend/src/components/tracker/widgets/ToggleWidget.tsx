import React from 'react';
import type { Habit, HabitLog } from '../../../types';
import { upsertHabitLog } from '../../../db/queries';

interface WidgetProps {
  habit: Habit;
  log?: HabitLog;
  date: string;
}

export const ToggleWidget: React.FC<WidgetProps> = ({ habit, log, date }) => {
  // Reflect the stored log; without a log the toggle starts unchecked.
  const isDone = (log?.value ?? 0) > 0;

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
