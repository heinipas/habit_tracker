import React, { useState, useEffect } from 'react';
import type { Habit, HabitLog, HabitConfig } from '../../../types';
import { upsertHabitLog } from '../../../db/queries';

interface WidgetProps {
  habit: Habit;
  log?: HabitLog;
  date: string;
}

export const CounterWidget: React.FC<WidgetProps> = ({ habit, log, date }) => {
  let config: HabitConfig = {};
  try {
    config = JSON.parse(habit.config_json || '{}');
  } catch {
    // fallback
  }

  const step = config.step && config.step > 0 ? config.step : 1;
  const defaultPicker = config.default_picker_value != null ? config.default_picker_value : 0;
  const currentValue = log ? log.value : defaultPicker;
  const [inputValue, setInputValue] = useState<string>(String(currentValue));

  useEffect(() => {
    setInputValue(String(currentValue));
  }, [currentValue, date]);

  const saveValue = async (val: number) => {
    await upsertHabitLog(habit.id, date, val);
  };

  const handleDelta = async (delta: number) => {
    const parsed = parseFloat(inputValue);
    const base = !isNaN(parsed) ? parsed : currentValue;
    const nextVal = Math.round((base + delta) * 10000) / 10000;
    setInputValue(String(nextVal));
    await saveValue(nextVal);
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    const num = parseFloat(text);
    if (!isNaN(num)) {
      await saveValue(num);
    }
  };

  const handleInputBlur = async () => {
    const num = parseFloat(inputValue);
    if (isNaN(num)) {
      setInputValue(String(currentValue));
    } else {
      await saveValue(num);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button type="button" onClick={() => handleDelta(-step)}>-{step}</button>
      <input
        type="number"
        step={step}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        style={{ width: '80px' }}
      />
      {habit.unit && <span>{habit.unit}</span>}
      <button type="button" onClick={() => handleDelta(step)}>+{step}</button>
      {!log && config.default_picker_value != null && (
        <small style={{ color: '#666' }}>(Default: {defaultPicker})</small>
      )}
    </div>
  );
};
