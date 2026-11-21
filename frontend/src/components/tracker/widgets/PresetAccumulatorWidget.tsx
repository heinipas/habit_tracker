import React, { useState, useEffect } from 'react';
import type { Habit, HabitLog, HabitConfig, PresetItem } from '../../../types';
import { accumulateHabitLog } from '../../../db/queries';

interface WidgetProps {
  habit: Habit;
  log?: HabitLog;
  date: string;
}

export const PresetAccumulatorWidget: React.FC<WidgetProps> = ({ habit, log, date }) => {
  let config: HabitConfig = {};
  try {
    config = JSON.parse(habit.config_json || '{}');
  } catch {
    // fallback
  }

  const presets: PresetItem[] = config.presets || [];
  const defaultCustomDelta = config.default_picker_value != null ? String(config.default_picker_value) : '';
  const currentValue = log ? log.value : 0;

  // Custom delta input - pre-filled with default_picker_value
  const [customDelta, setCustomDelta] = useState<string>(defaultCustomDelta);

  useEffect(() => {
    setCustomDelta(defaultCustomDelta);
  }, [defaultCustomDelta, date]);

  const handlePresetClick = async (delta: number) => {
    await accumulateHabitLog(habit.id, date, delta);
  };

  const handleCustomDeltaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const delta = parseFloat(customDelta);
    if (!isNaN(delta)) {
      await accumulateHabitLog(habit.id, date, delta);
      setCustomDelta(defaultCustomDelta);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <strong>Current Total: </strong>
        <span>{currentValue} {habit.unit || ''}</span>
      </div>

      {/* Preset quick-tap buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {presets.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handlePresetClick(preset.delta)}
          >
            +{preset.delta} ({preset.emoji ? `${preset.emoji} ` : ''}{preset.label})
          </button>
        ))}
      </div>

      {/* Custom delta input (pre-filled with default picker value if configured) */}
      <form onSubmit={handleCustomDeltaSubmit} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          type="number"
          step="any"
          placeholder="Custom +/- delta"
          value={customDelta}
          onChange={(e) => setCustomDelta(e.target.value)}
          style={{ width: '130px' }}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
};
