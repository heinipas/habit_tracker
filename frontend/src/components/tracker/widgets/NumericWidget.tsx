import React, { useState, useEffect } from 'react';
import type { Habit, HabitLog, HabitConfig } from '../../../types';
import { upsertHabitLog } from '../../../db/queries';

interface WidgetProps {
  habit: Habit;
  log?: HabitLog;
  date: string;
}

export const NumericWidget: React.FC<WidgetProps> = ({ habit, log, date }) => {
  let config: HabitConfig = {};
  try {
    config = JSON.parse(habit.config_json || '{}');
  } catch {
    // empty config
  }

  const defaultPicker = config.default_picker_value != null ? String(config.default_picker_value) : '';
  const initialValue = log ? String(log.value) : defaultPicker;

  const [value, setValue] = useState<string>(initialValue);
  const [isSaved, setIsSaved] = useState<boolean>(!!log);

  useEffect(() => {
    if (log) {
      setValue(String(log.value));
      setIsSaved(true);
    } else {
      setValue(defaultPicker);
      setIsSaved(false);
    }
  }, [log, date, defaultPicker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(value);
    if (!isNaN(num)) {
      await upsertHabitLog(habit.id, date, num);
      setIsSaved(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setIsSaved(false);
        }}
        placeholder={defaultPicker || '0'}
        style={{ width: '100px' }}
      />
      {habit.unit && <span>{habit.unit}</span>}
      <button type="submit">Save</button>
      {isSaved && <small style={{ color: 'green' }}>&check; Saved</small>}
      {!isSaved && value !== '' && <small style={{ color: 'orange' }}>Unsaved</small>}
      {!log && defaultPicker !== '' && (
        <small style={{ color: '#666' }}>(Default: {defaultPicker})</small>
      )}
    </form>
  );
};
